/* eslint-disable import/prefer-default-export */
import { unlinkSync } from 'fs';
import low from 'lowdb';
import FileSync from 'lowdb/adapters/FileSync';
import {
  kenvPath,
  prefsPath,
  isFile,
  shortcutsPath,
  mainScriptPath,
} from './helpers';

const DEFAULT_SHORTCUT = 'cmd ;';
const createDefaultShortcuts = (mainShortcut: string) => ({
  shortcuts: {
    [mainScriptPath]: mainShortcut,
  },
});

const DEFAULT_SHOW_JOIN = true;

const createDefaultPrefs = (join: boolean) => ({
  showJoin: join,
});

const oldPrefsPath = kenvPath('db', 'kit.json');
let oldPrefsDb: any = null;
if (isFile(oldPrefsPath)) {
  const adapter = new FileSync(oldPrefsPath);
  oldPrefsDb = low(adapter) as any;
  unlinkSync(oldPrefsPath);
}

export const createPrefs = () => {
  const adapter = new FileSync(prefsPath);
  const prefsDb = low(adapter);

  const oldShowJoin: boolean = oldPrefsDb && oldPrefsDb.get('join').value();

  prefsDb
    .defaults(createDefaultPrefs(oldShowJoin || DEFAULT_SHOW_JOIN))
    .write();
};

export const createShortcuts = () => {
  const adapter = new FileSync(shortcutsPath);
  const shortcutsDb = low(adapter);

  const oldShortcut: string =
    oldPrefsDb && oldPrefsDb.get('shortcuts.kit.main.index').value();

  shortcutsDb
    .defaults(createDefaultShortcuts(oldShortcut || DEFAULT_SHORTCUT))
    .write();
};

export const setupPrefs = () => {
  if (!isFile(prefsPath)) {
    createPrefs();
  }
  if (!isFile(shortcutsPath)) {
    createShortcuts();
  }
};
