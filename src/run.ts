/* eslint-disable no-nested-ternary */
/* eslint-disable import/prefer-default-export */
import { fork } from 'child_process';
import log from 'electron-log';
import path from 'path';
import {
  KIT,
  KENV,
  execPath,
  PATH,
  DOTENV,
  KIT_MAC_APP,
  kenvPath,
} from './helpers';
import { ChildInfo, processMap } from './state';
import { getVersion } from './version';

interface CreateChildInfo {
  from: string;
  scriptPath: string;
  runArgs: string[];
  resolve?: (data: any) => void;
  reject?: (error: any) => void;
}

export const createChild = ({
  from,
  scriptPath,
  runArgs,
  resolve,
  reject,
}: CreateChildInfo) => {
  let resolvePath = scriptPath.startsWith(path.sep)
    ? scriptPath
    : scriptPath.includes(path.sep)
    ? kenvPath(scriptPath)
    : kenvPath('scripts', scriptPath);

  if (!resolvePath.endsWith('.js')) resolvePath = `${resolvePath}.js`;

  const child = fork(KIT_MAC_APP, [resolvePath, ...runArgs, '--app'], {
    silent: false,
    // stdio: 'inherit',
    execPath,
    env: {
      ...process.env,
      KIT_CONTEXT: 'app',
      KIT_MAIN: scriptPath,
      PATH,
      KENV,
      KIT,
      DOTENV,
      KIT_APP_VERSION: getVersion(),
    },
  });

  log.info(`\n> begin ${from} process ${scriptPath} id: ${child.pid}`);

  processMap.set(child.pid, {
    from,
    child,
    scriptPath,
    values: [],
  });

  child.on('exit', () => {
    const { values } = processMap.get(child.pid) as ChildInfo;
    if (resolve) {
      resolve(values);
    }
    log.info(`end ${from} process ${scriptPath} id: ${child.pid}\n`);
    processMap.delete(child.pid);
  });

  child.on('error', (error) => {
    if (reject) reject(error);
  });

  return child;
};
