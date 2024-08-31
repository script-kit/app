import { writeFile } from 'node:fs/promises';
import { ensureSymlink } from '../cjs-exports';
import { kenvPath } from '@johnlindquist/kit/core/utils';
import { promisify } from 'node:util';
import { exec } from 'node:child_process';
import {} from 'pnpm';

const execP = promisify(exec);
const isWindows = process.platform === 'win32';

export async function setupPnpm() {
  async function createWindowsWrapper(pnpmPath: string, symlinkPath: string): Promise<void> {
    const cmdContent = `@echo off\n"${pnpmPath}" %*`;
    await writeFile(symlinkPath, cmdContent, 'utf8');
  }

  try {
    console.log('Installing pnpm locally...');
    const kenvDir = kenvPath();
    await execP(`pnpm install pnpm --prefix "${kenvDir}"`);

    // Create symlink
    const pnpmPath = kenvPath('node_modules', '.bin', 'pnpm');
    const symlinkPath = kenvPath(isWindows ? 'pnpm.cmd' : 'pnpm');

    console.log('Creating symlink...');
    if (isWindows) {
      await createWindowsWrapper(pnpmPath, symlinkPath);
    } else {
      await ensureSymlink(pnpmPath, symlinkPath);
    }

    console.log('Configuring pnpm to use local Node.js version...');
    try {
      await execP(`pnpm config set use-node-version ${process.versions.node} --location project`);
      console.log('pnpm configuration updated successfully.');
    } catch (configError) {
      console.error('Failed to update pnpm configuration:', configError);
      console.log('You may need to run this command manually after setup.');
    }

    console.log('You may use the pnpm env command to install Node.js.');
  } catch (error) {
    console.error('An error occurred during setup:', error);
    process.exit(1);
  }
}
