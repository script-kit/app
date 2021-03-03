import { app } from 'electron';
import path from 'path';

export const APP_NAME = 'Kit';
export const KIT_PROTOCOL = 'kit';
export const KENV = path.join(app.getPath('home'), '.kenv');
export const KIT = path.join(app.getPath('home'), '.kit');

export const kenv = (...parts: string[]) => path.join(KENV, ...parts);

export const kitPath = (...parts: string[]) => path.join(KIT, ...parts);

export const KENV_SCRIPTS = kenv('scripts');
export const KENV_APP = kenv('app');
export const KENV_BIN = kenv('bin');

export const stringifyScriptArgsKey = (
  scriptPath: string,
  runArgs: string[]
): any => {
  const scriptString: string = scriptPath
    .replace(kenv() + path.sep, '')
    .replace('.js', '');
  const argsString: string = runArgs ? `${runArgs.join('.')}` : ``;

  return {
    script: scriptString,
    args: argsString,
    key: scriptString + (argsString ? `/${argsString}` : ``),
  };
};
