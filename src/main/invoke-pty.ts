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
    case 'cmd.exe':
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

export async function invoke(command: string): Promise<string> {
  console.log(`Invoking command: ${command}`);

  return new Promise((resolve, reject) => {
    const shell = getDefaultShell();
    const separator = getCommandSeparator(shell);

    // Use a login shell to ensure all initialization scripts are run
    const shellArgs = process.platform === 'darwin' ? ['-l', '-c'] : ['-c'];
    const fullCommand = `${command} ${separator} exit`;

    console.log(`Shell: ${shell}`);
    console.log(`Shell args: ${shellArgs.join(' ')}`);
    console.log(`Full command: ${fullCommand}`);

    console.log('Spawning PTY process...');
    const ptyProcess = pty.spawn(shell, [...shellArgs, fullCommand], {
      name: 'xterm-color',
      cols: 80,
      rows: 30,
      cwd: os.homedir(),
      env: {
        ...process.env,
        TERM: 'xterm-color',
        FORCE_COLOR: '1',
      },
    });
    console.log(`PTY process spawned with PID: ${ptyProcess.pid}`);

    let output = '';

    ptyProcess.onData((data) => {
      output += data;
      console.log('Received data from PTY process:', data);
    });

    let exitTimeout: NodeJS.Timeout;

    ptyProcess.onExit(({ exitCode, signal }) => {
      console.log(`PTY process exited with code ${exitCode} and signal ${signal}`);
      clearTimeout(exitTimeout);
      // Trim any leading/trailing whitespace
      const cleanedOutput = output.trim();
      console.log('Cleaned output:', cleanedOutput);
      resolve(cleanedOutput);
    });

    // Set a timeout in case the command doesn't complete
    exitTimeout = setTimeout(() => {
      console.log('Command timed out, killing PTY process...');
      ptyProcess.kill();
      reject(new Error('Command timed out'));
    }, 5000);
  });
}
