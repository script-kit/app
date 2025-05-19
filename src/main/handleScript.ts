import { Channel } from '@johnlindquist/kit/core/enum';
import { parseScript, resolveToScriptPath } from '@johnlindquist/kit/core/utils';
import { Trigger } from '../shared/enums';
import { runPromptProcess } from './kit';
import { createLogger } from './log-utils';
import { runMainScript } from './main-script';
import { spawnShebang } from './process';
import { getApiKey } from './server/server-utils';

const log = createLogger('handleScript');

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
  const processInfo = await runPromptProcess(
    scriptPath,
    args.map((s: string) => s.replaceAll('$newline$', '\n')),
    { force: true, trigger: Trigger.Kar, sponsorCheck: false, headers: headers || {} },
  );

  if (response) {
    log.info('🚗💨 Response metadata detected, listening for response...');
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
