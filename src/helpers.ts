/* eslint-disable no-useless-escape */
/* eslint-disable no-nested-ternary */
/* eslint-disable jest/no-export */
/* eslint-disable jest/expect-expect */
/* eslint-disable no-param-reassign */

import v8 from 'v8';
import path from 'path';
import os from 'os';
import log from 'electron-log';
import colors from 'color-name';
import { contrastColor } from 'contrast-color';

import { mainScriptPath, kitPath } from '@johnlindquist/kit/cjs/utils';

export const APP_NAME = 'Kit';
export const KIT_PROTOCOL = 'kit';

export const structuredClone = (obj: any) => {
  return v8.deserialize(v8.serialize(obj));
};

const homeDirectory = os.homedir();

// ripped from https://raw.githubusercontent.com/sindresorhus/tildify/main/index.js
export function tildify(absolutePath: string) {
  const normalizedPath = path.normalize(absolutePath) + path.sep;

  return (normalizedPath.startsWith(homeDirectory)
    ? normalizedPath.replace(homeDirectory + path.sep, `~${path.sep}`)
    : normalizedPath
  ).slice(0, -1);
}

export const isInDirectory = (filePath: string, dir: string) => {
  const relative = path.relative(dir, filePath);
  return !relative.startsWith(`..`) && !path.isAbsolute(relative);
};

export function pathsAreEqual(path1: string, path2: string) {
  path1 = path.resolve(path1);
  path2 = path.resolve(path2);
  if (process.platform === 'win32')
    return path1.toLowerCase() === path2.toLowerCase();
  return path1 === path2;
}

export const isKitScript = (scriptPath: string) => {
  // if scriptPath is not equal to mainScriptPath, return false
  if (path.relative(scriptPath, mainScriptPath) === '') {
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
  if (hexOrRgbOrName.includes(',')) return hexOrRgbOrName;
  if (colors[hexOrRgbOrName]) return colors[hexOrRgbOrName].join(',');

  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(
    hexOrRgbOrName
  );

  if (!result) return `0, 0, 0`;

  const r = parseInt(result[1], 16);
  const g = parseInt(result[2], 16);
  const b = parseInt(result[3], 16);

  return `${r}, ${g}, ${b}`;
};

export const toHex = (hexOrRgbOrName: string) => {
  if (hexOrRgbOrName.includes(',')) {
    const [r, g, b] = hexOrRgbOrName.split(',').map((c) => parseInt(c, 10));

    return `#${r.toString(16)}${g.toString(16)}${b.toString(16)}`;
  }

  if (colors[hexOrRgbOrName]) return colors[hexOrRgbOrName].join(',');

  return hexOrRgbOrName;
};

export const maybeConvertColors = (value: any) => {
  if (value.foreground) {
    value['--color-white'] = toRgb(value.foreground);
    value['--color-black'] = toRgb(value.foreground);
  }
  if (value.accent) {
    value['--color-primary-light'] = toRgb(value.accent);
    value['--color-primary-dark'] = toRgb(value.accent);

    const contrast = contrastColor({
      bgColor: toHex(value.accent),
    }) as string;

    log.info({ contrast });

    value['--color-contrast-light'] = toRgb(contrast);
    value['--color-contrast-dark'] = toRgb(contrast);
  }

  if (value.background) {
    value['--color-background-light'] = toRgb(value.background);
    value['--color-background-dark'] = toRgb(value.background);
  }

  if (value.opacity) {
    value['--opacity-light'] = value.opacity;
    value['--opacity-dark'] = value.opacity;
  }

  log.info(value);

  if (value.background) delete value.background;
  if (value.foreground) delete value.foreground;
  if (value.accent) delete value.accent;
  if (value.opacity) delete value.opacity;
};
