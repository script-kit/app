import { rm } from 'fs/promises';
import { kitPath, knodePath } from '@johnlindquist/kit/cjs/utils';
import log from 'electron-log';
import { app } from 'electron';
import { forceQuit } from './state';

export const repairKitSDKNodeModules = async () => {
  log.warn(`Repairing kit SDK node_modules...`);
  try {
    await rm(knodePath(), { recursive: true, force: true });
    await rm(kitPath(), { recursive: true, force: true });
  } catch (error) {
    log.error(error);
  }

  app.relaunch();

  forceQuit();
};
