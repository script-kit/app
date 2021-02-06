import { app } from 'electron';
import path from 'path';

const SIMPLE_PATH = path.join(app.getPath('home'), '.simple');
export const simplePath = (...parts: string[]) =>
  path.join(SIMPLE_PATH, ...parts);

export const SIMPLE_SCRIPTS_PATH = simplePath('scripts');
export const SIMPLE_APP_SCRIPTS_PATH = simplePath('app');
export const SIMPLE_BIN_PATH = simplePath('bin');
export const SIMPLE_NODE_PATH = simplePath('node');

export const stringifyScriptArgsKey = (
  scriptPath: string,
  runArgs: string[]
): any => {
  const scriptString: string = scriptPath
    .replace(simplePath() + path.sep, '')
    .replace('.js', '');
  const argsString: string = runArgs ? `${runArgs.join('.')}` : ``;

  return {
    script: scriptString,
    args: argsString,
    key: scriptString + (argsString ? `.${argsString}` : ``),
  };
};
