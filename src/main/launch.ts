import { existsSync } from 'node:fs';
import AutoLaunch from 'auto-launch';
import { app } from 'electron';
import log from 'electron-log';

let oldPath: string | undefined;
const getOldAppPath = () => {
  if (oldPath) {
    return oldPath;
  }

  const currentPath = app.getPath('exe');
  oldPath = currentPath.replaceAll('Script Kit', 'Kit');
  log.info(`Old app path: ${oldPath} vs new ${currentPath}`);
  return oldPath;
};

export async function disableOldAutoLaunch(): Promise<void> {
  try {
    if (!existsSync(getOldAppPath())) {
      log.info('Old app path does not exist, skipping auto-launch disable');
      return;
    }

    const kitAutoLauncher = new AutoLaunch({
      name: 'Kit',
      path: getOldAppPath(),
    });

    const isEnabled = await kitAutoLauncher.isEnabled();

    if (isEnabled) {
      await kitAutoLauncher.disable();
      log.info(`Auto-launch disabled for ${getOldAppPath()}`);
    } else {
      log.info(`Auto-launch for ${getOldAppPath()} is not enabled`);
    }
  } catch (error) {
    log.error('Error setting auto-launch:', error);
    throw error;
  }
}
