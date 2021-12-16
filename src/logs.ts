/* eslint-disable @typescript-eslint/naming-convention */
/* eslint-disable no-underscore-dangle */
/* eslint-disable no-console */
/* eslint-disable import/prefer-default-export */
import log from 'electron-log';
import fs from 'fs';
import {
  kenvPath,
  commandFromFilePath,
  kenvFromFilePath,
} from '@johnlindquist/kit/cjs/utils';

export const consoleLog = log.create('consoleLog');
consoleLog.transports.file.resolvePath = () => kenvPath('logs', 'console.log');

export function ansiRegex({ onlyFirst = false } = {}) {
  const pattern = [
    '[\\u001B\\u009B][[\\]()#;?]*(?:(?:(?:[a-zA-Z\\d]*(?:;[-a-zA-Z\\d\\/#&.:=?%@~_]*)*)?\\u0007)',
    '(?:(?:\\d{1,4}(?:;\\d{0,4})*)?[\\dA-PR-TZcf-ntqry=><~]))',
  ].join('|');

  return new RegExp(pattern, onlyFirst ? undefined : 'g');
}

export function stripAnsi(string: string) {
  if (typeof string !== 'string') {
    throw new TypeError(`Expected a \`string\`, got \`${typeof string}\``);
  }

  return string.replace(ansiRegex(), '');
}
interface Logger {
  info: (...args: string[]) => void;
  warn: (...args: string[]) => void;
  clear: () => void;
}

const logMap = new Map<string, Logger>();

export const getLog = (id: string): Logger => {
  try {
    const command = commandFromFilePath(id);
    const kenv = kenvFromFilePath(id);
    const isKenv = kenv && kenv !== '.kit';

    if (logMap.get(id)) return logMap.get(id) as Logger;

    const scriptLog = log.create(id);
    const logPath = kenvPath(
      ...(isKenv ? ['kenvs', kenv] : []),
      'logs',
      `${command}.log`
    );
    scriptLog.transports.file.resolvePath = () => logPath;

    const _info = scriptLog.info.bind(scriptLog);
    const _warn = scriptLog.warn.bind(scriptLog);
    const logger = {
      info: (...args: string[]) => {
        _info(...args.map(stripAnsi));
      },
      warn: (...args: string[]) => {
        _warn(...args.map(stripAnsi));
      },
      clear: () => {
        fs.writeFileSync(logPath, ``);
      },
    };
    logMap.set(id, logger);

    return logger;
  } catch {
    return {
      info: (...args: any[]) => {
        console.log(...args.map(stripAnsi));
      },
      warn: (...args: any[]) => {
        console.warn(...args.map(stripAnsi));
      },
      clear: () => {},
    };
  }
};
