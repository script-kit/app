/* eslint-disable import/prefer-default-export */
import { grep } from 'shelljs';
import log from 'electron-log';
import { globalShortcut } from 'electron';
import chokidar from 'chokidar';
import path from 'path';
import { SIMPLE_SCRIPTS_PATH, trySimpleScript } from './simple';

export const shortcutMap = new Map();

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
    const shortcutMarker = 'Shortcut: ';
    const { stdout } = grep(shortcutMarker, filePath);

    const shortcut = stdout
      .substring(0, stdout.indexOf('\n'))
      .substring(stdout.indexOf(shortcutMarker) + shortcutMarker.length)
      .trim();

    const oldShortcut = shortcutMap.get(filePath);

    const command = filePath
      .replace(SIMPLE_SCRIPTS_PATH, '')
      .replace('/', '')
      .replace('.js', '');
    // Handle existing shortcuts
    if (oldShortcut) {
      // No change
      if (oldShortcut === shortcut) {
        log.info(`${shortcut} is already registered to ${command}`);
        return;
      }

      // User removed an existing shortcut
      globalShortcut.unregister(oldShortcut);
      shortcutMap.delete(filePath);
      log.info(`Unregistered ${oldShortcut} from ${command}`);
    }

    if (!shortcut) return;
    // At this point, we know it's a new shortcut, so register it

    const ret = globalShortcut.register(shortcut, () => {
      // const execPath = filePath.replace('scripts', 'bin').replace('.js', '');

      trySimpleScript(filePath, []);
    });

    if (!ret) {
      log.info(`Failed to register: ${shortcut} to ${command}`);
    }

    if (ret && globalShortcut.isRegistered(shortcut)) {
      log.info(`Registered ${shortcut} to ${command}`);
      shortcutMap.set(filePath, shortcut);
    }
  }
};

export const manageShortcuts = async () => {
  chokidar
    .watch(`${SIMPLE_SCRIPTS_PATH}${path.sep}*.js`, { depth: 0 })
    .on('all', onFilesChanged);
};
