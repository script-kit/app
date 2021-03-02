import { app } from 'electron';
import path from 'path';

export const SKA = path.join(app.getPath('home'), '.ska');
export const KIT = path.join(app.getPath('home'), '.kit');

export const sk = (...parts: string[]) => path.join(SKA, ...parts);

export const kitPath = (...parts: string[]) => path.join(KIT, ...parts);

export const SKA_SCRIPTS = sk('scripts');
export const SKA_APP = sk('app');
export const SKA_BIN = sk('bin');

export const stringifyScriptArgsKey = (
  scriptPath: string,
  runArgs: string[]
): any => {
  const scriptString: string = scriptPath
    .replace(sk() + path.sep, '')
    .replace('.js', '');
  const argsString: string = runArgs ? `${runArgs.join('.')}` : ``;

  return {
    script: scriptString,
    args: argsString,
    key: scriptString + (argsString ? `/${argsString}` : ``),
  };
};
