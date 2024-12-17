import * as os from 'node:os';
import * as path from 'node:path';
import { kitPnpmPath } from '@johnlindquist/kit/core/utils';
import { ptyPool } from './pty';
import { getDefaultShell, getCommandSeparator, getReturnCharacter } from './pty-utils';
import { getShellArgs } from './pty-utils';

export async function invoke(command: string, cwd = os.homedir()): Promise<string> {
  console.log(`Invoking command: ${command}`);

  return new Promise((resolve, reject) => {
    const shell = getDefaultShell();
    const separator = getCommandSeparator(shell);
    const returnCharacter = getReturnCharacter();
    const fullCommand = `${command} ${separator} exit${returnCharacter}`;
    const shellArgs = getShellArgs();

    console.log(`Shell: ${shell}`);
    console.log(`Shell args: ${shellArgs.join(' ')}`);
    console.log(`Full command: ${fullCommand}`);

    const env: Record<string, string> = {
      ...process.env,
      PNPM_HOME: kitPnpmPath(),
      TERM: 'xterm-color',
      FORCE_COLOR: '1',
      DISABLE_AUTO_UPDATE: 'true', // Disable auto-update for zsh
    };

    if (env?.PNPM_HOME && env?.PATH) {
      console.log(`PNPM_HOME: ${env.PNPM_HOME}`);
      env.PATH = `${env.PNPM_HOME}${path.delimiter}${env.PATH}`;
    }

    const ptyOptions = {
      name: 'xterm-color',
      cols: 80,
      rows: 30,
      cwd,
      env,
    };

    console.log('Getting PTY from pool...');

    const ptyProcess = ptyPool.getIdlePty(shell, [...shellArgs, fullCommand], ptyOptions, {
      command: fullCommand,
      pid: Date.now(),
    });

    console.log(`PTY process spawned with PID: ${ptyProcess.pid}`);

    let output = '';

    ptyProcess.onData((data) => {
      output += data.toString();
      console.log({ output });
    });
    // Set a timeout in case the command doesn't complete
    const exitTimeout = setTimeout(() => {
      console.log('Command timed out, killing PTY process...');
      ptyProcess.kill();
      reject(new Error('Command timed out'));
    }, 2000);

    ptyProcess.onExit(({ exitCode, signal }) => {
      console.log(`PTY process exited with code ${exitCode} and signal ${signal}`);
      clearTimeout(exitTimeout);
      // Trim any leading/trailing whitespace
      const cleanedOutput = output.trim();
      console.log('Cleaned output:', cleanedOutput);
      ptyProcess.kill();

      if (exitCode !== 0) {
        console.log('Command failed with exit code', exitCode);
        console.log('Cleaned output:', cleanedOutput);
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
