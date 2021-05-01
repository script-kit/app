/* eslint-disable jest/no-export */
/* eslint-disable jest/expect-expect */
import { app } from 'electron';
import path from 'path';
import { test } from 'shelljs';

export const APP_NAME = 'Kit';
export const KIT_PROTOCOL = 'kit';
export const KENV = process.env.KENV || path.join(app.getPath('home'), '.kenv');
export const KIT = process.env.KIT || path.join(app.getPath('home'), '.kit');

export const kenvPath = (...parts: string[]) => path.join(KENV, ...parts);
export const kitPath = (...parts: string[]) => path.join(KIT, ...parts);
export const settingsFile = kenvPath('db', 'kit.json');
export const mainFilePath = kitPath('main', 'index.js');

export const KENV_SCRIPTS = kenvPath('scripts');
export const KENV_APP = kenvPath('app');
export const KENV_BIN = kenvPath('bin');

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

export const dirExists = (dir: string) => test('-d', dir);
