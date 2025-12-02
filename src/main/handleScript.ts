import { Channel } from '@johnlindquist/kit/core/enum';
import { parseScript, resolveToScriptPath } from '@johnlindquist/kit/core/utils';
import { Trigger } from '../shared/enums';
import { runPromptProcess } from './kit';
import { mcpLog as log } from './logs';
import { runMainScript } from './main-script';
import { spawnShebang } from './process';
import { getApiKey } from './server/server-utils';

export const UNDEFINED_VALUE = '__undefined__';

/**
 * Determines the launch context based on headers and flags
 */
function determineLaunchContext(headers: Record<string, string>, mcpResponse: boolean): string {
  // Check for MCP context
  if (
    mcpResponse ||
    headers['X-MCP-Tool'] ||
    headers['X-MCP-Resource'] ||
    headers['X-MCP-Prompt'] ||
    headers['X-MCP-Parameters']
  ) {
    return 'mcp';
  }

  // Check for socket context
  if (headers['X-Kit-Socket']) {
    return 'socket';
  }

  // Check for HTTP server context
  if (headers['X-Kit-Server'] || headers['kit-api-key']) {
    return 'http';
  }

  // Default to direct call
  return 'direct';
}

/**
 * Handles the execution of a script based on the provided parameters.
 * @param script - The script to execute.
 * @param args - Arguments for the script.
 * @param cwd - Current working directory.
 * @returns An object containing the status and message of the execution.
 */
export async function handleScript(
  script: string,
  args: string[],
  cwd: string,
  checkAccess = false,
  apiKey = '',
  headers: Record<string, string> = {},
  mcpResponse = false,
): Promise<{ status: number; data?: any; message?: string; headers?: Record<string, string> }> {
  if (script === '') {
    await runMainScript();
    return { status: 200, data: 'Main script executed' };
  }

  const scriptPath = resolveToScriptPath(script, cwd);
  if (!scriptPath) {
    return { status: 404, data: '🕹 kit needs a script!' };
  }

  log.info(`🇦🇷 ${scriptPath} ${args}`);
  const { shebang, access, response, timeout } = await parseScript(scriptPath);

  if (checkAccess) {
    const trimmedAccess = access?.trim();

    // Deny access if 'access' is undefined, null, empty, or 'private'
    if (!trimmedAccess || trimmedAccess === 'private') {
      return { status: 401, data: '🔒 Access denied. Your script is marked as // Access: private' };
    }

    // If 'access' is 'key', verify the provided API key
    if (trimmedAccess === 'key') {
      const envApiKey = getApiKey();
      // log.info(`Checking access with key: ${apiKey} and env: ${envApiKey}`)
      if (apiKey !== envApiKey || !apiKey || !envApiKey) {
        return {
          status: 401,
          data: '🔒 Access denied. Please provide a valid KIT_API_KEY in ~/.kenv/.env and mark your script with // Access: key',
        };
      }
    }
    // If 'access' is neither 'key' nor 'public', deny access
    else if (trimmedAccess !== 'public') {
      return { status: 401, data: '🔒 Access denied. Please mark your script with // Access: public' };
    }
  }
  if (shebang) {
    spawnShebang({ command: shebang, args, shell: true, cwd, filePath: scriptPath });
    return { status: 200, data: `🚗💨 ~/.kit/kar ${script} ${args.join(' ')}` };
  }
  // Determine the launch context for the script
  const launchContext = determineLaunchContext(headers, mcpResponse);

  const processInfo = await runPromptProcess(
    scriptPath,
    args.map((s: string) => s.replaceAll('$newline$', '\n')).filter(Boolean),
    {
      force: true,
      trigger: Trigger.Kar,
      sponsorCheck: false,
      headers: {
        ...headers,
        'X-Kit-Launch-Context': launchContext,
      },
    },
  );

  // If mcpResponse is true OR response metadata is set, wait for the response
  if (mcpResponse || response) {
    log.info('🚗💨 Response mode detected, listening for response...');
    return await new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject({ status: 500, message: `🕒 Timed out after ${timeout}ms` });
      }, timeout || 10000);

      processInfo?.child?.addListener('message', (payload: any) => {
        if (payload.channel === Channel.RESPONSE) {
          log.info(`🚗💨 ${payload.channel} received response`);
          clearTimeout(timeoutId);

          // Handle the response from the child process
          const { body, statusCode, headers } = payload.value;

          const message = {
            status: statusCode,
            data: body,
            headers: headers,
          };

          // Log response info without the full data payload to avoid stack overflow with large images
          let dataInfo = 'no data';
          if (body) {
            if (typeof body === 'string') {
              dataInfo = `string (${body.length} chars)`;
            } else if (Buffer.isBuffer(body)) {
              dataInfo = `Buffer (${body.length} bytes)`;
            } else if (typeof body === 'object') {
              // For objects, just count properties without stringifying
              const keys = Object.keys(body);
              dataInfo = `object (${keys.length} keys)`;
              // Check if it contains image data
              if (body.content && Array.isArray(body.content)) {
                const imageCount = body.content.filter((item: any) => item?.type === 'image').length;
                if (imageCount > 0) {
                  dataInfo += ` with ${imageCount} image(s)`;
                }
              }
            }
          }

          log.info(`Response received: status=${statusCode}, data=${dataInfo}`);
          processInfo.child.send({ channel: Channel.RESPONSE, value: message });
          resolve(message);
        }
      });

      processInfo?.child?.addListener('error', (error: any) => {
        log.error(`🚗💨 ${error.message}`);
        clearTimeout(timeoutId);
        reject({ status: 500, message: error.message });
      });
    });
  }

  return { status: 200, data: `🚗💨 ~/.kit/kar ${script} ${args.join(' ')}`.trim() };
}
