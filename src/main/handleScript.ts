import { parseScript, resolveToScriptPath } from '@johnlindquist/kit/core/utils';
import { Trigger } from '../shared/enums';
import { runPromptProcess } from './kit';
import { spawnShebang } from './process';
import { runMainScript } from './main-script';
import { createLogger } from '../shared/log-utils';
import { getApiKey } from './server/server-utils';

const log = createLogger('handleScript');

/**
 * Handles the execution of a script based on the provided parameters.
 * @param script - The script to execute.
 * @param args - Arguments for the script.
 * @param cwd - Current working directory.
 * @returns An object containing the status and message of the execution.
 */
export async function handleScript(script: string, args: string[], cwd: string, checkAccess= false, apiKey = ''): Promise<{ status: number; message: string }> {
  if (script === '') {
    await runMainScript();
    return { status: 200, message: 'Main script executed' };
  }

  const scriptPath = resolveToScriptPath(script, cwd);
  if (!scriptPath) {
    return { status: 404, message: '🕹 kit needs a script!' };
  }

  log.info(`🇦🇷 ${scriptPath} ${args}`);
  const { shebang, access } = await parseScript(scriptPath);

  if (checkAccess) {
    const trimmedAccess = access?.trim();

    // Deny access if 'access' is undefined, null, empty, or 'private'
    if (!trimmedAccess || trimmedAccess === 'private') {
      return { status: 401, message: '🔒 Access denied. Your script is marked as // Access: private' };
    }

    // If 'access' is 'key', verify the provided API key
    if (trimmedAccess === 'key') {
      const envApiKey = getApiKey();
      // log.info(`Checking access with key: ${apiKey} and env: ${envApiKey}`)
      if (apiKey !== envApiKey || !apiKey || !envApiKey) {
        return {
          status: 401,
          message: '🔒 Access denied. Please provide a valid KIT_API_KEY in ~/.kenv/.env and mark your script with // Access: key',
        };
      }
    }
    // If 'access' is neither 'key' nor 'public', deny access
    else if (trimmedAccess !== 'public') {
      return { status: 401, message: '🔒 Access denied. Please mark your script with // Access: public' };
    }
  }
  if (shebang) {
    spawnShebang({ command: shebang, args, shell: true, cwd, filePath: scriptPath });
  } else {
    await runPromptProcess(
      scriptPath,
      args.map((s: string) => s.replaceAll('$newline$', '\n')),
      { force: true, trigger: Trigger.Kar, sponsorCheck: false },
    );
  }

  return { status: 200, message: `🚗💨 ~/.kit/kar ${script} ${args.join(' ')}` };
}
