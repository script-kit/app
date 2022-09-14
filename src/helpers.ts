/* eslint-disable no-useless-escape */
/* eslint-disable no-nested-ternary */
/* eslint-disable jest/no-export */
/* eslint-disable jest/expect-expect */

import v8 from 'v8';
import path from 'path';
import os from 'os';

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
