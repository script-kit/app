/* eslint-disable @typescript-eslint/naming-convention */
/* eslint-disable no-underscore-dangle */
/* eslint-disable no-console */
/* eslint-disable import/prefer-default-export */
import log, { LevelOption } from 'electron-log';
import * as path from 'path';
import { subscribeKey } from 'valtio/utils';
import fs from 'fs';
import { kenvPath, getLogFromScriptPath } from '@johnlindquist/kit/cjs/utils';
import { Channel } from '@johnlindquist/kit/cjs/enum';
import { app } from 'electron';
import { sendToPrompt } from './prompt';
import { stripAnsi } from './ansi';
import { kitState, subs } from './state';

const isDev = process.env.NODE_ENV === 'development';

if (isDev) {
  app.setAppLogsPath(app.getPath('logs').replace('Electron', 'Kit'));
}

export const consoleLog = log.create('consoleLog');
consoleLog.transports.file.resolvePath = () => kenvPath('logs', 'console.log');

export const updateLogPath = path.resolve(app.getPath('logs'), 'update.log');
export const updateLog = log.create('updateLog');
updateLog.transports.file.resolvePath = () => updateLogPath;
log.info({ updateLogPath });

export const mainLogPath = path.resolve(app.getPath('logs'), 'main.log');
export const mainLog = log.create('mainLog');
mainLog.transports.file.resolvePath = () => mainLogPath;
log.info({ mainLogPath });

interface Logger {
  info: (...args: string[]) => void;
  warn: (...args: string[]) => void;
  clear: () => void;
}

const logMap = new Map<string, Logger>();

export const getLog = (scriptPath: string): Logger => {
  try {
    if (logMap.get(scriptPath)) return logMap.get(scriptPath) as Logger;

    const scriptLog = log.create(scriptPath);
    const logPath = getLogFromScriptPath(scriptPath);
    log.info(`Log path: ${logPath}`);
    scriptLog.transports.file.resolvePath = () => logPath;
    scriptLog.transports.file.level = kitState.logLevel;

    const _info = scriptLog.info.bind(scriptLog);
    const _warn = scriptLog.warn.bind(scriptLog);
    const _verbose = scriptLog.verbose.bind(scriptLog);
    const _debug = scriptLog.debug.bind(scriptLog);
    const _silly = scriptLog.silly.bind(scriptLog);

    const wrap = (fn: (...args: string[]) => void) => (...args: string[]) => {
      try {
        fn(...args);
      } catch (error) {
        console.log(error);
      }
    };
    const logger = {
      info: wrap(_info),
      warn: wrap(_warn),
      verbose: wrap(_verbose),
      debug: wrap(_debug),
      silly: wrap(_silly),
      clear: () => {
        fs.writeFileSync(logPath, ``);
      },
    };
    logMap.set(scriptPath, logger);

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

export const warn = (message: string) => {
  sendToPrompt(Channel.CONSOLE_WARN, message);
  log.warn(message);
};

log.transports.console.level = 'info';
if (process.env.LOG_LEVEL) {
  log.info('🪵 Setting log level', process.env.LOG_LEVEL);
  log.transports.file.level = process.env.LOG_LEVEL as LevelOption;
} else if (process.env.NODE_ENV === 'production') {
  log.transports.file.level = 'info';
} else {
  if (log.transports.ipc) log.transports.ipc.level = 'error';
  log.transports.file.level = 'verbose';
}

const subLogLevel = subscribeKey(kitState, 'logLevel', (level) => {
  log.info(`📋 Log level set to: ${level}`);
  log.transports.file.level = level;
});

subs.push(subLogLevel);
