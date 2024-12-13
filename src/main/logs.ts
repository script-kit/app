import fs from 'node:fs';
import * as path from 'node:path';
import { getLogFromScriptPath, kenvPath, kitPath } from '@johnlindquist/kit/core/utils';
import { app } from 'electron';
import log, { type FileTransport, type LevelOption } from 'electron-log';
import { subscribeKey } from 'valtio/utils';
import { stripAnsi } from './ansi';
import { kitState, subs } from './state';
import { TrackEvent, trackEvent } from './track';

const isDev = process.env.NODE_ENV === 'development';

if (isDev) {
  app.setAppLogsPath(app.getPath('logs').replace('Electron', 'Kit'));
}

log.info(`


���🟢 🟢  !!!SCRIPT KIT TIME!!! 🟢 🟢 🟢 `);

log.info('Skipping Setup?', {
  MAIN_SKIP_SETUP: process.env.MAIN_SKIP_SETUP,
});

export interface Logger {
  info: (...args: string[]) => void;
  warn: (...args: string[]) => void;
  clear: () => void;
}

export const logMap = new Map<string, Logger>();

export const getLog = (scriptPath: string): Logger => {
  try {
    if (logMap.get(scriptPath)) {
      return logMap.get(scriptPath) as Logger;
    }

    const scriptLog = log.create({
      logId: scriptPath,
    });
    const logPath = getLogFromScriptPath(scriptPath);
    log.info(`Log path: ${logPath}`);
    (scriptLog.transports.file as FileTransport).resolvePathFn = () => logPath;
    (scriptLog.transports.file as FileTransport).level = kitState.logLevel;

    const _info = scriptLog.info.bind(scriptLog);
    const _warn = scriptLog.warn.bind(scriptLog);
    const _verbose = scriptLog.verbose.bind(scriptLog);
    const _debug = scriptLog.debug.bind(scriptLog);
    const _silly = scriptLog.silly.bind(scriptLog);

    const wrap =
      (fn: (...args: string[]) => void) =>
      (...args: string[]) => {
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
        fs.writeFileSync(logPath, '');
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
  // TODO: Which prompt should I send warnings to?
  // sendToSpecificPrompt(Channel.CONSOLE_WARN, message);
  log.warn(message);
};

log.transports.console.level = 'info';

if (process.env.VITE_LOG_LEVEL) {
  log.info('🪵 Setting log level', process.env.VITE_LOG_LEVEL);
  log.transports.file.level = process.env.VITE_LOG_LEVEL as LevelOption;
} else if (process.env.NODE_ENV === 'production') {
  log.transports.file.level = 'info';
} else {
  if (log.transports.ipc) {
    log.transports.ipc.level = 'error';
  }
  log.transports.file.level = 'verbose';
}

const _error = log.error.bind(log);
log.error = (message: string, ...args: any[]) => {
  try {
    trackEvent(TrackEvent.LogError, { message, args });
  } catch (error) {
    //
  }
  _error(message, ...args);
};

const subLogLevel = subscribeKey(kitState, 'logLevel', (level) => {
  log.info(`📋 Log level set to: ${level}`);
  log.transports.file.level = level;
});

subs.push(subLogLevel);

function createLogInstance(logId: string, level?: LevelOption) {
  const logPath = path.resolve(app.getPath('logs'), `${logId}.log`);
  const logInstance = log.create({ logId });
  (logInstance.transports.file as FileTransport).resolvePathFn = () => logPath;
  log.info(`${logId} log path:`, logPath);

  if (level) {
    (logInstance.transports.console as any).level = level;
  }
  return { logInstance, logPath };
}

export const { logInstance: updateLog, logPath: updateLogPath } = createLogInstance('update');
export const { logInstance: mainLog, logPath: mainLogPath } = createLogInstance('main');
export const { logInstance: scriptLog, logPath: scriptLogPath } = createLogInstance('scripts');
export const { logInstance: windowLog, logPath: windowLogPath } = createLogInstance('window');
export const { logInstance: kitLog, logPath: kitLogPath } = createLogInstance('kit');
export const { logInstance: debugLog, logPath: debugLogPath } = createLogInstance('debug');
export const { logInstance: consoleLog, logPath: consoleLogPath } = createLogInstance('console');
export const { logInstance: workerLog, logPath: workerLogPath } = createLogInstance('worker');
export const { logInstance: keymapLog, logPath: keymapLogPath } = createLogInstance('keymap');
export const { logInstance: shortcutsLog, logPath: shortcutsLogPath } = createLogInstance('shortcuts');
export const { logInstance: watcherLog, logPath: watcherLogPath } = createLogInstance('watcher');
