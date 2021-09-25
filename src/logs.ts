/* eslint-disable @typescript-eslint/naming-convention */
/* eslint-disable no-underscore-dangle */
/* eslint-disable no-console */
/* eslint-disable import/prefer-default-export */
import log from 'electron-log';
import { kenvPath } from '@johnlindquist/kit/cjs/utils';

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

const logMap = new Map<string, log.ElectronLog>();
export const getLog = (id: string) => {
  try {
    const normalizedId = id.replace(/.*\//g, '').replace('.js', '');

    if (logMap.get(normalizedId))
      return logMap.get(normalizedId) as log.ElectronLog;

    const scriptLog = log.create(normalizedId);
    scriptLog.transports.file.resolvePath = () =>
      kenvPath('logs', `${normalizedId}.log`);

    const _info = scriptLog.info.bind(scriptLog);
    const _warn = scriptLog.warn.bind(scriptLog);
    scriptLog.info = (...args) => {
      _info(...args.map(stripAnsi));
    };
    scriptLog.warn = (...args) => {
      _warn(...args.map(stripAnsi));
    };

    return scriptLog;
  } catch {
    return {
      info: (...args: any[]) => {
        console.log(...args.map(stripAnsi));
      },
      warn: (...args: any[]) => {
        console.warn(...args.map(stripAnsi));
      },
    };
  }
};
