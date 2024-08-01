/* eslint-disable no-useless-escape */
/* eslint-disable no-nested-ternary */
/* eslint-disable jest/no-export */
/* eslint-disable jest/expect-expect */
/* eslint-disable no-param-reassign */

import os from 'node:os';
import path from 'node:path';
import v8 from 'node:v8';
import colors from 'color-name';
import log from 'electron-log';

import { getMainScriptPath, kitPath, shortcutNormalizer } from '@johnlindquist/kit/core/utils';
import type { Choice } from '@johnlindquist/kit/types/core';
import { Trigger } from '../shared/enums';
import { KitEvent, emitter } from '../shared/events';
import type { ScoredChoice } from '../shared/types';
import { convertKey } from './state';

export const APP_NAME = 'Kit';
export const KIT_PROTOCOL = 'kit';

export const structuredClone = (obj: any) => {
  return v8.deserialize(v8.serialize(obj));
};

const homeDirectory = os.homedir();

// ripped from https://raw.githubusercontent.com/sindresorhus/tildify/main/index.js
export function tildify(absolutePath: string) {
  const normalizedPath = path.normalize(absolutePath) + path.sep;

  return (
    normalizedPath.startsWith(homeDirectory)
      ? normalizedPath.replace(homeDirectory + path.sep, `~${path.sep}`)
      : normalizedPath
  ).slice(0, -1);
}

export const isInDirectory = (filePath: string, dir: string) => {
  const relation = path.relative(dir, filePath);

  return Boolean(
    relation && relation !== '..' && !relation.startsWith(`..${path.sep}`) && relation !== path.resolve(filePath),
  );
};

export function pathsAreEqual(path1: string, path2: string) {
  path1 = path.resolve(path1);
  path2 = path.resolve(path2);
  if (process.platform === 'win32') {
    return path1.toLowerCase() === path2.toLowerCase();
  }
  return path1 === path2;
}

export const isKitScript = (scriptPath: string) => {
  // if scriptPath is not equal to getMainScriptPath(), return false
  if (path.relative(scriptPath, getMainScriptPath()) === '') {
    log.verbose(`>>>> Main script: ${scriptPath}`);
    return false;
  }

  if (isInDirectory(scriptPath, kitPath())) {
    log.verbose(`>>>> Kit script: ${scriptPath}`);
    return true;
  }

  log.verbose(`>>>> Not kit script: ${scriptPath}`);
  return false;
};

export const toRgb = (hexOrRgbOrName: string) => {
  if (hexOrRgbOrName === 'lighten' || hexOrRgbOrName === 'darken') {
    return hexOrRgbOrName;
  }
  if (hexOrRgbOrName.includes(',')) {
    return hexOrRgbOrName;
  }
  if (colors[hexOrRgbOrName]) {
    return colors[hexOrRgbOrName].join(',');
  }

  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hexOrRgbOrName);

  if (!result) {
    return '0, 0, 0';
  }

  const r = Number.parseInt(result[1], 16);
  const g = Number.parseInt(result[2], 16);
  const b = Number.parseInt(result[3], 16);

  return `${r}, ${g}, ${b}`;
};

const validateAccelerator = (shortcut: string) => {
  const parts = shortcut.split('+');
  let keyFound = false;
  return parts.every((val, index) => {
    const isKey = keyCodes.test(val);
    const isModifier = modifiers.test(val);
    if (isKey) {
      // Key must be unique
      if (keyFound) {
        return false;
      }
      keyFound = true;
    }
    // Key is required
    if (index === parts.length - 1 && !keyFound) {
      return false;
    }
    return isKey || isModifier;
  });
};

const modifiers = /^(Command|Cmd|Control|Ctrl|CommandOrControl|CmdOrCtrl|Alt|Option|AltGr|Shift|Super)$/;
const keyCodes =
  /^([0-9A-Z)!@#$%^&*(:+<_>?~{|}";=,\-./`[\\\]']|F1*[1-9]|F10|F2[0-4]|Plus|Space|Tab|Backspace|Delete|Insert|Return|Enter|Up|Down|Left|Right|Home|End|PageUp|PageDown|Escape|Esc|VolumeUp|VolumeDown|VolumeMute|MediaNextTrack|MediaPreviousTrack|MediaStop|MediaPlayPause|PrintScreen)$/;

const infoScript = kitPath('cli', 'info.js');

const conversionFail = (shortcut: string, filePath: string, otherPath = '') => `# Shortcut Conversion Failed

Attempted to convert to a valid shortcut, but result was invalid:

<code>${shortcut}</code>

Please open ${path.basename(filePath)} and try again or ask a question in our [Github Discussions](https://github.com/johnlindquist/kit/discussions)
`;

export const shortcutInfo = (shortcut: string, targetScriptPath: string, md = conversionFail, otherScriptPath = '') => {
  const markdown = md(shortcut, targetScriptPath, otherScriptPath);
  log.warn(markdown);

  emitter.emit(KitEvent.RunPromptProcess, {
    scriptPath: infoScript,
    args: [path.basename(targetScriptPath), shortcut, markdown],
    options: {
      force: true,
      trigger: Trigger.Info,
    },
  });
};

export const convertShortcut = (shortcut: string, filePath: string): string => {
  if (!shortcut?.length) {
    return '';
  }
  const normalizedShortcut = shortcutNormalizer(shortcut);
  // log.info({ shortcut, normalizedShortcut });
  const [sourceKey, ...mods] = normalizedShortcut
    .trim()
    .split(/\+| /)
    .map((str: string) => str.trim())
    .filter(Boolean)
    .reverse();
  // log.info(`Shortcut main key: ${sourceKey}`);

  if (!(mods.length && sourceKey?.length)) {
    if (!mods.length) {
      log.info('No modifiers found');
    }
    if (!sourceKey?.length) {
      log.info('No main key found');
    }
    // shortcutInfo(normalizedShortcut, filePath);
    return '';
  }

  if (sourceKey?.length > 1) {
    if (!validateAccelerator(normalizedShortcut)) {
      log.info(`Invalid shortcut: ${normalizedShortcut}`);
      shortcutInfo(normalizedShortcut, filePath);
      return '';
    }

    return normalizedShortcut;
  }

  const convertedKey = convertKey(sourceKey).toUpperCase();
  const finalShortcut = `${mods.reverse().join('+')}+${convertedKey}`;

  if (!validateAccelerator(finalShortcut)) {
    shortcutInfo(finalShortcut, filePath);
    return '';
  }

  return finalShortcut;
};

export const createScoredChoice = (item: Choice): ScoredChoice => {
  return {
    item,
    score: 0,
    matches: {},
    _: '',
  };
};

export const isLocalPath = (input: string) => {
  try {
    const parsedUrl = new URL(input);
    // If the URL is successfully parsed and has a protocol, it's a remote URL
    if (parsedUrl.protocol) {
      return false;
    }
  } catch (error) {
    // An error in parsing the URL means it's likely a local path
    // Additional checks can be made here if necessary
  }

  // Further checks to confirm it's a valid local path could be added here
  // For now, we assume any non-URL is a local path
  return true;
};

export const isUrl = (input: string) => {
  try {
    new URL(input);
    return true;
  } catch (error) {
    return false;
  }
};
