import * as os from 'node:os';
import * as path from 'node:path';
import { kitPnpmPath } from '@johnlindquist/kit/core/utils';
import { ptyPool } from './pty';
import { getCommandSeparator, getDefaultShell, getReturnCharacter } from './pty-utils';
import { getShellArgs } from './pty-utils';

export async function invoke(command: string, cwd = os.homedir()): Promise<string> {
  return new Promise((resolve, reject) => {
    const shell = getDefaultShell();
    const separator = getCommandSeparator(shell);
    const returnCharacter = getReturnCharacter();
    const fullCommand = `${command} ${separator} exit${returnCharacter}`;
    const shellArgs = getShellArgs();

    const env: Record<string, string> = {
      ...process.env,
      PNPM_HOME: kitPnpmPath(),
      TERM: 'xterm-color',
      FORCE_COLOR: '1',
      DISABLE_AUTO_UPDATE: 'true', // Disable auto-update for zsh
    };

    if (env?.PNPM_HOME && env?.PATH) {
      env.PATH = `${env.PNPM_HOME}${path.delimiter}${env.PATH}`;
    }

    const ptyOptions = {
      name: 'xterm-color',
      cols: 80,
      rows: 30,
      cwd,
      env,
    };

    const ptyProcess = ptyPool.getIdlePty(shell, [...shellArgs, fullCommand], ptyOptions, {
      command: fullCommand,
      pid: Date.now(),
    });

    let output = '';

    ptyProcess.onData((data) => {
      output += data.toString();
    });
    // Set a timeout in case the command doesn't complete
    const exitTimeout = setTimeout(() => {
      ptyProcess.kill();
      reject(new Error('Command timed out'));
    }, 2000);

    ptyProcess.onExit(({ exitCode, signal }) => {
      clearTimeout(exitTimeout);
      // Trim any leading/trailing whitespace
      const cleanedOutput = output.trim();
      ptyProcess.kill();

      if (exitCode !== 0) {
        reject(
          new Error(
            `
Scriptlet Failed with exit code ${exitCode}

Attempted to run:
~~~
${fullCommand}
~~~

Error output:
~~~
${cleanedOutput}
~~~
          `.trim(),
          ),
        );
      }
      resolve(cleanedOutput);
    });
  });
}
