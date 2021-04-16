/* eslint-disable jest/no-export */
/* eslint-disable import/prefer-default-export */
import { grep, test } from 'shelljs';
import log from 'electron-log';
import { globalShortcut } from 'electron';
import chokidar from 'chokidar';
import path from 'path';

import { readFile } from 'fs/promises';
import { tryKitScript } from './kit';
import { kenvPath, kitPath } from './helpers';

export const shortcutMap = new Map();

const settingsFile = kenvPath('db', 'kit.json');
const mainFilePath = kitPath('main', 'index.js');

const shortcutNormalizer = (shortcut: string) =>
  shortcut
    .replace(/(option|opt)/i, 'Alt')
    .replace(
      /(commandorcontrol|cmdorctrl|ctrl|ctl|command|cmd)/i,
      'CommandOrControl'
    )
    .split(/\s/)
    .filter(Boolean)
    .map((part) => (part[0].toUpperCase() + part.slice(1)).trim())
    .join('+');

const onScriptsChanged = async (
  event: 'add' | 'change' | 'unlink',
  filePath: string
) => {
  if (event === 'change') log.info({ event, filePath });
  if (event === 'unlink') {
    const oldShortcut = shortcutMap.get(filePath);

    if (oldShortcut) {
      globalShortcut.unregister(oldShortcut);
      shortcutMap.delete(filePath);
    }
  }
  if (event === 'add' || event === 'change') {
    const shortcutMarker = 'Shortcut: ';
    const { stdout } = grep(shortcutMarker, filePath);

    const rawShortcut = stdout
      .substring(0, stdout.indexOf('\n'))
      .substring(stdout.indexOf(shortcutMarker) + shortcutMarker.length)
      .trim();

    const shortcut = rawShortcut ? shortcutNormalizer(rawShortcut) : '';

    const oldShortcut = shortcutMap.get(filePath);

    // Handle existing shortcuts
    if (oldShortcut) {
      // No change
      if (oldShortcut === shortcut) {
        log.info(`${shortcut} is already registered to ${filePath}`);
        return;
      }

      // User removed an existing shortcut
      globalShortcut.unregister(oldShortcut);
      shortcutMap.delete(filePath);
      log.info(`Unregistered ${oldShortcut} from ${filePath}`);
    }

    if (!shortcut) return;
    // At this point, we know it's a new shortcut, so register it

    const ret = globalShortcut.register(shortcut, async () => {
      // const execPath = filePath.replace('scripts', 'bin').replace('.js', '');

      await tryKitScript(filePath, []);
    });

    if (!ret) {
      log.info(`Failed to register: ${shortcut} to ${filePath}`);
    }

    if (ret && globalShortcut.isRegistered(shortcut)) {
      log.info(`Registered ${shortcut} to ${filePath}`);
      shortcutMap.set(filePath, shortcut);
    }
  }
};

export const onDbChanged = async (event, filePath) => {
  if (filePath === settingsFile) {
    log.info(`SETTINGS CHANGED:`, filePath);
    const settings = JSON.parse(await readFile(filePath, 'utf-8'));
    const rawShortcut = settings?.shortcuts?.kit?.main?.index;

    const shortcut = rawShortcut ? shortcutNormalizer(rawShortcut) : '';

    if (shortcut) {
      const oldShortcut = shortcutMap.get(mainFilePath);

      if (shortcut === oldShortcut) return;

      if (oldShortcut) {
        globalShortcut.unregister(oldShortcut);
        shortcutMap.delete(mainFilePath);
      }

      const ret = globalShortcut.register(shortcut, async () => {
        await tryKitScript(mainFilePath, []);
      });

      if (!ret) {
        log.info(`Failed to register: ${shortcut} to ${mainFilePath}`);
      }

      if (ret && globalShortcut.isRegistered(shortcut)) {
        log.info(`Registered ${shortcut} to ${mainFilePath}`);
        shortcutMap.set(mainFilePath, shortcut);
      }
    }
  }
};

export const cacheMenu = async () => {
  await tryKitScript(kitPath('cli', 'cache-menu'));
};

export const manageShortcuts = async () => {
  if (!test('-f', settingsFile)) {
    await tryKitScript(kitPath('setup', 'create-settings'));
  }

  const dbWatcher = chokidar.watch([`${kenvPath('db')}${path.sep}*.json`], {
    depth: 0,
  });

  dbWatcher.on('all', onDbChanged);

  const scriptsWatcher = chokidar.watch(
    [`${kenvPath('scripts')}${path.sep}*.js`],
    {
      depth: 0,
    }
  );

  scriptsWatcher.on('all', onScriptsChanged);

  scriptsWatcher.on('ready', async () => {
    await cacheMenu();

    scriptsWatcher.on('add', cacheMenu);
    scriptsWatcher.on('change', cacheMenu);
    scriptsWatcher.on('unlink', cacheMenu);
  });
};
