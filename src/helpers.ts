/* eslint-disable jest/no-export */
/* eslint-disable jest/expect-expect */
import { app } from 'electron';
import path from 'path';
import { mkdir, test } from 'shelljs';
import low from 'lowdb';
import FileSync from 'lowdb/adapters/FileSync';
import { emitter, AppEvent } from './events';

export const isDir = (dir: string) => test('-d', dir);
export const isFile = (file: string) => test('-f', file);
export const createPathIfNotExists = (checkPath: string) => {
  if (!isDir(checkPath)) {
    mkdir('-p', checkPath);
  }
};

export const APP_NAME = 'Kit';
export const KIT_PROTOCOL = 'kit';

export const KIT = process.env.KIT || path.join(app.getPath('home'), '.kit');
export const kitPath = (...parts: string[]) => path.join(KIT, ...parts);

export const kitAppTmp = kitPath('tmp');
export const kitAppDb = kitPath('db');

createPathIfNotExists(kitAppTmp);
createPathIfNotExists(kitAppDb);

export const appDbPath = kitPath('db', 'app.json');

const adapter = new FileSync(appDbPath);
export const appDb = low(adapter);

const DEFAULT_KENV = path.join(app.getPath('home'), '.kenv');

appDb
  .defaults({
    needsRestart: false,
    version: '0.0.0',
    KENV: DEFAULT_KENV,
    KENVS: [DEFAULT_KENV],
  })
  .write();

export const getKenv = () => {
  const kenv = appDb.get('KENV').value();
  return kenv;
};
export const getKenvs = () => {
  appDb.read();
  return appDb.get('KENVS').value();
};

if (process.env.KENV) {
  appDb.set('KENV', process.env.KENV).write();
  if (!getKenvs().includes(process.env.KENV))
    (appDb.get('KENVS') as any).push(process.env.KENV).write();
}

if (!isDir(getKenv())) {
  appDb.set('KENV', DEFAULT_KENV).write();
}

export const kenvPath = (...parts: string[]) => path.join(getKenv(), ...parts);

export const getKenvDotEnv = () => process.env.KIT_DOTENV || kenvPath('.env');

export const prefsPath = kitPath('db', 'prefs.json');
export const shortcutsPath = kitPath('db', 'shortcuts.json');
export const promptDbPath = kitPath('db', 'prompt.json');
export const mainScriptPath = kitPath('main', 'index.js');

export const KENV_SCRIPTS = kenvPath('scripts');
export const KENV_APP = kenvPath('app');
export const KENV_BIN = kenvPath('bin');

export const execPath = kitPath('node', 'bin', 'node');

export const KIT_MAC_APP = kitPath('mac-app.js');
export const PATH = `${kitPath('node', 'bin')}:${process.env.PATH}`;

export const setKenv = (setKenvPath: string) => {
  console.log(`Attempting to switch to ${setKenvPath}`);
  if (getKenvs().includes(setKenvPath)) {
    console.log(`Switching to ${setKenvPath}`);

    appDb.set('KENV', setKenvPath).write();
    emitter.emit(AppEvent.SET_KENV);
    // emitter.emit(EVENT.TRY_KIT_SCRIPT, { filePath: mainScriptPath });
  }
};

export const createKenv = (createKenvPath: string) => {
  if (!getKenvs().includes(createKenvPath))
    (appDb.get('KENVS') as any).push(createKenvPath).write();
  setKenv(createKenvPath);
  // emitter.emit(EVENT.TRY_KIT_SCRIPT, { filePath: mainScriptPath });
};

export const stringifyScriptArgsKey = (
  scriptPath: string,
  runArgs: string[]
): any => {
  const scriptString: string = scriptPath
    .replace(kenvPath() + path.sep, '')
    .replace('.js', '');
  const argsString: string = runArgs ? `${runArgs.join('.')}` : ``;

  return {
    script: scriptString,
    args: argsString,
    key: scriptString + (argsString ? `/${argsString}` : ``),
  };
};
