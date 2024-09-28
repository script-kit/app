import * as pty from 'node-pty';
import * as os from 'node:os';
import * as fs from 'node:fs';
import * as path from 'node:path';

function getDefaultShell(): string {
  console.log(`Operating System: ${process.platform}`);

  if (process.platform === 'win32') {
    const shell = process.env.COMSPEC || 'cmd.exe';
    console.log(`Windows shell: ${shell}`);
    return shell;
  }

  console.log('SHELL environment variable:', process.env.SHELL);
  const shellFromEnv = process.env.SHELL;
  if (shellFromEnv && fs.existsSync(shellFromEnv)) {
    console.log(`Using shell from environment: ${shellFromEnv}`);
    return shellFromEnv;
  }

  // Fallback options
  const commonShells = ['/bin/zsh', '/bin/bash', '/bin/sh'];
  for (const shell of commonShells) {
    if (fs.existsSync(shell)) {
      console.log(`Found fallback shell: ${shell}`);
      return shell;
    }
  }

  console.error('No suitable shell found');
  throw new Error('Unable to determine default shell');
}

function getCommandSeparator(shell: string): string {
  const shellName = path.basename(shell).toLowerCase();

  switch (shellName) {
    case 'powershell.exe':
    case 'pwsh.exe':
      return '&';
    case 'fish':
      return '; and';
    case 'csh':
    case 'tcsh':
      return ';';
    default: // bash, zsh, sh, and most others
      return '&&';
  }
}

export function getShellArgs(): string[] {
  if (process.platform === 'win32') {
    return ['/c'];
  }

  if (process.platform === 'darwin') {
    return ['-l', '-c'];
  }

  return ['-c'];
}

export function getReturnCharacter(): string {
  return process.platform === 'win32' ? '\r\n' : '\n';
}

export async function invoke(command: string, cwd = os.homedir()): Promise<string> {
  console.log(`Invoking command: ${command}`);

  return new Promise((resolve, reject) => {
    const shell = getDefaultShell();
    const separator = getCommandSeparator(shell);

    // Use a login shell to ensure all initialization scripts are run
    const shellArgs = getShellArgs();
    const returnCharacter = getReturnCharacter();
    const fullCommand = `${command} ${separator} exit${returnCharacter}`;

    console.log(`Shell: ${shell}`);
    console.log(`Shell args: ${shellArgs.join(' ')}`);
    console.log(`Full command: ${fullCommand}`);

    const env: Record<string, string> = {
      ...process.env,
      TERM: 'xterm-color',
      FORCE_COLOR: '1',
      DISABLE_AUTO_UPDATE: 'true', // Disable auto-update for zsh
    };

    if (env?.PNPM_HOME && env?.PATH) {
      console.log(`PNPM_HOME: ${env.PNPM_HOME}`);
      env.PATH = `${env.PNPM_HOME}${path.delimiter}${env.PATH}`;
    }

    console.log('Spawning PTY process...');

    const ptyProcess = pty.spawn(shell, [...shellArgs, fullCommand], {
      name: 'xterm-color',
      cols: 80,
      rows: 30,
      cwd,
      env,
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
      resolve(cleanedOutput);
      ptyProcess.kill();
    });
  });
}
