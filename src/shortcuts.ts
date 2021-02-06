/* eslint-disable import/prefer-default-export */
import { grep } from 'shelljs';
import log from 'electron-log';
import { globalShortcut } from 'electron';
import chokidar from 'chokidar';
import path from 'path';

import { trySimpleScript } from './simple';
import { simplePath } from './helpers';
import { cache } from './cache';

export const shortcutMap = new Map();

const shortcutNormalizer = (shortcut: string) =>
  shortcut
    .replace(/(option|opt)/i, 'Alt')
    .replace(
      /(commandorcontrol|cmdorctrl|ctrl|ctl|command|cmd)/i,
      'CommandOrControl'
    )
    .split(/\s|\+|-/)
    .filter(Boolean)
    .map((part) => (part[0].toUpperCase() + part.slice(1)).trim())
    .join('+');

const onFilesChanged = (
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
    cache.clear();

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

    const ret = globalShortcut.register(shortcut, () => {
      // const execPath = filePath.replace('scripts', 'bin').replace('.js', '');

      trySimpleScript(filePath, []);
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

export const manageShortcuts = async () => {
  chokidar
    .watch(
      [
        `${simplePath('scripts')}${path.sep}*.js`,
        `${simplePath('app')}${path.sep}*.js`,
      ],
      { depth: 0 }
    )
    .on('all', onFilesChanged);
};
