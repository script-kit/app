import { writeFile } from 'node:fs/promises';
import { ensureSymlink, remove, pathExists } from '../cjs-exports';
import { kitPath } from '@johnlindquist/kit/core/utils';
import { spawnP } from '../install';

import { createLogger } from '../../shared/log-utils';
const log = createLogger('setup-pnpm.ts');

const isWindows = process.platform === 'win32';

// export async function setupPnpm() {
//   async function createWindowsWrapper(pnpmPath: string, symlinkPath: string): Promise<void> {
//     const cmdContent = `@echo off\n"${pnpmPath}" %*`;
//     await writeFile(symlinkPath, cmdContent, 'utf8');
//   }

//   try {
//     log.info('Installing pnpm locally...');
//     const pnpmPath = kitPath('node_modules', '.bin', 'pnpm');
//     const symlinkPath = kitPath(isWindows ? 'pnpm.cmd' : 'pnpm');

//     log.info('Creating symlink...');
//     if (isWindows) {
//       await createWindowsWrapper(pnpmPath, symlinkPath);
//     } else {
//       await ensureSymlink(pnpmPath, symlinkPath);
//     }

//     log.info('Configuring pnpm to use local Node.js version...');
//     try {
//       await spawnP(`pnpm config set use-node-version ${process.versions.node} --location project`, {
//         cwd: kenvPath(),
//       });
//       log.info('pnpm configuration updated successfully.');
//     } catch (configError) {
//       log.error('Failed to update pnpm configuration:', configError);
//       log.info('You may need to run this command manually after setup.');
//     }
//   } catch (error) {
//     log.error('An error occurred during setup:', error);
//     process.exit(1);
//   }

//   log.info(`Checking for stray ${kitPath('node')} directory...`);
//   try {
//     const nodeDir = kitPath('node');
//     if (await pathExists(nodeDir)) {
//       await remove(nodeDir);
//     }
//   } catch (error) {
//     log.error('An error occurred while checking/removing the node directory:', error);
//   }
// }
