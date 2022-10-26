import * as path from 'path';
import os from 'os';
import {
  kenvPath,
  kitPath,
  knodePath,
  KIT_FIRST_PATH,
} from '@johnlindquist/kit/cjs/utils';

import { fork, spawn, SpawnSyncOptions } from 'child_process';

import log from 'electron-log';
import { kitState } from './state';

const KIT = kitPath();

const options: SpawnSyncOptions = {
  cwd: KIT,
  encoding: 'utf-8',
  env: {
    KIT,
    KENV: kenvPath(),
    PATH: KIT_FIRST_PATH + path.delimiter + process?.env?.PATH,
  },
  stdio: 'pipe',
};

export const repairKitSDKNodeModules = async () => {
  kitState.status = {
    status: 'busy',
    message: `Repairing kit SDK node_modules...`,
  };
  const isWin = os.platform().startsWith('win');
  const child = isWin
    ? fork(
        knodePath('bin', 'node_modules', 'npm', 'bin', 'npm-cli.js'),
        [`ci`, `--production`, `--loglevel`, `verbose`],
        options
      )
    : spawn(
        knodePath('bin', 'npm'),
        [`ci`, `--production`, `--loglevel`, `verbose`],
        options
      );

  if (child.stdout) {
    child.stdout.on('data', (data) => {
      log.info(data.toString());
    });
  }

  if (child.stderr) {
    child.stderr.on('data', (data) => {
      log.info(data.toString());
    });
  }

  child.on('message', (data) => {
    log.info(data.toString());
  });
  child.on('exit', () => {
    log.info('exit');

    kitState.status = {
      status: 'default',
      message: `Repairing Kit SDK node_modules...`,
    };
  });
  child.on('error', (error) => {
    log.error(error);
    kitState.status = {
      status: 'warn',
      message: `Failed to repair Kit SDK node_modules...`,
    };
  });
};
