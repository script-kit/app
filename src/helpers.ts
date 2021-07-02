/* eslint-disable no-useless-escape */
/* eslint-disable no-nested-ternary */
/* eslint-disable jest/no-export */
/* eslint-disable jest/expect-expect */
import { app } from 'electron';
import path from 'path';
import { grep, mkdir, test } from 'shelljs';
import low from 'lowdb';
import FileSync from 'lowdb/adapters/FileSync';
import { readFile } from 'fs/promises';
import { emitter, KitEvent } from './events';
import { Script } from './types';
import { UI, ProcessType } from './enums';

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
export const KIT_MAC_APP_PROMPT = kitPath('mac-app-prompt.js');
export const PATH = `${kitPath('node', 'bin')}:${process.env.PATH}`;

export const setKenv = (setKenvPath: string) => {
  console.log(`Attempting to switch to ${setKenvPath}`);
  if (getKenvs().includes(setKenvPath)) {
    console.log(`Switching to ${setKenvPath}`);

    appDb.set('KENV', setKenvPath).write();
    emitter.emit(KitEvent.SetKenv);
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

export const grepMetadata = (meta: string, filePath: string) =>
  grep(`^//\\s*${meta}\\s*`, filePath)?.stdout;

export const shortcutNormalizer = (shortcut: string) =>
  shortcut
    ? shortcut
        .replace(/(option|opt)/i, 'Alt')
        .replace(/(command|cmd)/i, 'CommandOrControl')
        .replace(/(ctl|cntrl|ctrl)/, 'Control')
        .split(/\s/)
        .filter(Boolean)
        .map((part) => (part[0].toUpperCase() + part.slice(1)).trim())
        .join('+')
    : '';

export const info = async (file: string): Promise<Script> => {
  const filePath: string = file.startsWith('/scripts')
    ? kenvPath(file)
    : file.startsWith(path.sep)
    ? file
    : kenvPath(file.includes('/') ? '' : 'scripts', file);

  const fileContents = await readFile(filePath, 'utf8');

  const getByMarker = (marker: string) =>
    fileContents
      .match(new RegExp(`(?<=^//\\s*${marker}\\s*).*`, 'gim'))?.[0]
      .trim() || '';

  const command = filePath.split(path.sep)?.pop()?.replace('.js', '') as string;
  const shortcut = shortcutNormalizer(getByMarker('Shortcut:'));
  const menu = getByMarker('Menu:');
  const schedule = getByMarker('Schedule:');
  const watch = getByMarker('Watch:');
  const system = getByMarker('System:');
  const background = getByMarker('Background:');
  const timeout = parseInt(getByMarker('Timeout:'), 10);

  const tabs =
    fileContents.match(new RegExp(`(?<=onTab[(]['"]).*(?=\s*['"])`, 'gim')) ||
    [];

  const ui = (fileContents
    .match(/(?<=await )arg|textarea|hotkey|drop/g)?.[0]
    .trim() ||
    getByMarker('UI:') ||
    UI.none) as UI;

  const requiresPrompt = Boolean(ui);

  const type = schedule
    ? ProcessType.Schedule
    : watch
    ? ProcessType.Watch
    : system
    ? ProcessType.System
    : background
    ? ProcessType.Background
    : ProcessType.Prompt;

  const kenv =
    filePath.match(
      new RegExp(`(?<=${kenvPath('kenvs')}\/)[^\/]+\/[^\/]+`)
    )?.[0] || '';

  const iconPath = kenv ? kenvPath('kenvs', kenv, 'icon.png') : '';

  const icon = kenv && (await isFile(iconPath)) ? iconPath : '';

  return {
    command,
    type,
    shortcut,
    menu,
    name: (menu || command) + (shortcut ? `: ${shortcut}` : ``),

    description: getByMarker('Description:'),
    alias: getByMarker('Alias:'),
    author: getByMarker('Author:'),
    twitter: getByMarker('Twitter:'),
    shortcode: getByMarker('Shortcode:'),
    exclude: getByMarker('Exclude:'),
    schedule,
    watch,
    system,
    background,
    id: filePath,
    filePath,
    requiresPrompt,
    timeout,
    tabs,
    kenv,
    image: getByMarker('Image:'),
    icon,
  };
};

export const resolveScriptPath = (scriptPath: string) => {
  let resolvePath = scriptPath.startsWith(path.sep)
    ? scriptPath
    : scriptPath.includes(path.sep)
    ? kenvPath(scriptPath)
    : kenvPath('scripts', scriptPath);

  if (!resolvePath.endsWith('.js')) resolvePath = `${resolvePath}.js`;

  return resolvePath;
};
