/* eslint-disable @typescript-eslint/naming-convention */
/* eslint-disable import/prefer-default-export */
import ipc from 'node-ipc';
import minimist from 'minimist';
import log from 'electron-log';
import { kitPath, KIT } from './helpers';
import { tryPromptScript } from './kit';

export const startSK = () => {
  ipc.config.id = KIT;
  ipc.config.retry = 1500;
  ipc.config.silent = true;

  ipc.serve(kitPath('tmp', 'ipc'), () => {
    ipc.server.on('message', async (argv) => {
      log.info(`ipc message:`, argv);
      const { _ } = minimist(argv);
      const [argScript, ...argArgs] = _;
      await tryPromptScript(argScript, argArgs);
    });
  });

  ipc.server.start();
};
