import fs from 'node:fs';
import * as path from 'node:path';
import { getLogFromScriptPath } from '@johnlindquist/kit/core/utils';
import { app } from 'electron';
import log, { type FileTransport, type LevelOption } from 'electron-log';
import { subscribeKey } from 'valtio/utils';
import { stripAnsi } from './ansi';
import { kitState, subs } from './state';
import { TrackEvent, trackEvent } from './track';

const isDev = process.env.NODE_ENV === 'development';

if (isDev) {
  const logsPath = app.getPath('logs').replace('Electron', 'Kit');
  app.setAppLogsPath(logsPath);
}

log.info('🚀 Script Kit Starting Up...');

export interface Logger {
  info: (...args: any[]) => void;
  warn: (...args: any[]) => void;
  error: (...args: any[]) => void;
  verbose: (...args: any[]) => void;
  debug: (...args: any[]) => void;
  silly: (...args: any[]) => void;
  clear: () => void;
}

type LoggerWithPath = Logger & { logPath: string };
type LogMap = Map<string, LoggerWithPath>;
export const logMap: LogMap = new Map<string, LoggerWithPath>();

export const getLog = (scriptPath: string): LoggerWithPath => {
  if (logMap.has(scriptPath)) {
    return logMap.get(scriptPath)!;
  }

  try {
    const scriptLog = log.create({ logId: scriptPath });
    const logPath = getLogFromScriptPath(scriptPath);
    log.info(`Log path: ${logPath}`);

    const fileTransport = scriptLog.transports.file as FileTransport;
    fileTransport.resolvePathFn = () => logPath;
    fileTransport.level = kitState.logLevel;

    // Generic wrapper to catch errors in logging functions
    const wrap = <T extends unknown[]>(fn: (...args: T) => void): ((...args: T) => void) => {
      return (...args: T): void => {
        try {
          fn(...args);
        } catch (error: unknown) {
          console.error('Logging error:', error);
        }
      };
    };

    const logger: LoggerWithPath = {
      info: wrap(scriptLog.info.bind(scriptLog)),
      warn: wrap(scriptLog.warn.bind(scriptLog)),
      error: wrap(scriptLog.error.bind(scriptLog)),
      verbose: wrap(scriptLog.verbose.bind(scriptLog)),
      debug: wrap(scriptLog.debug.bind(scriptLog)),
      silly: wrap(scriptLog.silly.bind(scriptLog)),
      clear: () => {
        fs.writeFileSync(logPath, '');
      },
      logPath,
    };

    logMap.set(scriptPath, logger);
    return logger;
  } catch (error) {
    console.error('Failed to create logger for scriptPath:', scriptPath, error);
    // Fallback logger using console and removing duplicate "clear" property
    const fallbackLogger: Logger & { logPath: string } = {
      info: (...args: Parameters<typeof log.info>) => console.log(...args.map(stripAnsi)),
      warn: (...args: Parameters<typeof log.warn>) => console.warn(...args.map(stripAnsi)),
      error: (...args: Parameters<typeof log.error>) => console.error(...args.map(stripAnsi)),
      verbose: (...args: Parameters<typeof log.verbose>) => console.log(...args.map(stripAnsi)),
      debug: (...args: Parameters<typeof log.debug>) => console.log(...args.map(stripAnsi)),
      silly: (...args: Parameters<typeof log.silly>) => console.log(...args.map(stripAnsi)),
      clear: () => {},
      logPath: '',
    };
    return fallbackLogger;
  }
};

export const warn = (message: string): void => {
  // TODO: Determine the appropriate prompt for warnings
  log.warn(message);
};

log.transports.console.level = false;

if (log.transports.ipc) {
  log.transports.ipc.level = false;
}

if (process.env.VITE_LOG_LEVEL) {
  log.info('🪵 Setting log level', process.env.VITE_LOG_LEVEL);
  log.transports.file.level = process.env.VITE_LOG_LEVEL as LevelOption;
  log.transports.console.level = false;
} else if (process.env.NODE_ENV === 'production') {
  log.transports.file.level = 'info';
  log.transports.console.level = false;
} else {
  log.transports.file.level = 'verbose';
}

const originalError = log.error.bind(log);
log.error = (message: string, ...args: any[]): void => {
  try {
    trackEvent(TrackEvent.LogError, { message, args });
  } catch (error: unknown) {
    console.error('Error tracking log error:', error);
  }
  originalError(message, ...args);
};

const subLogLevel = subscribeKey(kitState, 'logLevel', (level: LevelOption) => {
  log.info(`📋 Log level set to: ${level}`);
  (log.transports.file as FileTransport).level = level;
});
subs.push(subLogLevel);

function createLogInstance(logId: string): { logInstance: typeof log; logPath: string } {
  const logPath = path.resolve(app.getPath('logs'), `${logId}.log`);
  const logInstance = log.create({ logId });
  const fileTransport = logInstance.transports.file as FileTransport;
  fileTransport.resolvePathFn = () => logPath;
  logInstance.info('🟢 Script Kit Starting Up...');
  logInstance.info(`${logId} log path: ${logPath}`);

  logInstance.transports.console.level = false;
  logInstance.transports.ipc.level = false;
  logInstance.transports.file.level = kitState.logLevel;

  return { logInstance, logPath };
}

const logTypes = [
  'update',
  'main',
  'script',
  'window',
  'kit',
  'debug',
  'console',
  'worker',
  'keymap',
  'shortcuts',
  'schedule',
  'snippet',
  'scriptlet',
  'watcher',
  'error',
  'prompt',
  'process',
  'widget',
  'theme',
  'health',
  'system',
  'background',
  'server',
] as const;

type LogType = (typeof logTypes)[number];

export interface Logger {
  info: (...args: any[]) => void;
  warn: (...args: any[]) => void;
  error: (...args: any[]) => void;
  verbose: (...args: any[]) => void;
  debug: (...args: any[]) => void;
  silly: (...args: any[]) => void;
  clear: () => void;
}

type LogExports = {
  [K in LogType as `${K}Log`]: Omit<Logger, 'clear'>;
} & {
  [K in LogType as `${K}LogPath`]: string;
};

function createLogExports<T extends readonly LogType[]>(
  types: T,
): {
  [K in T[number] as `${K}Log`]: Omit<Logger, 'clear'>;
} & {
  [K in T[number] as `${K}LogPath`]: string;
} {
  const entries = types.flatMap((logType) => {
    const { logInstance, logPath } = createLogInstance(logType);
    return [
      [`${logType}Log` as const, logInstance],
      [`${logType}LogPath` as const, logPath],
    ];
  });

  // Build the object from the entries. We use Object.fromEntries and assert that the result satisfies the expected type.
  return Object.fromEntries(entries) as {
    [K in T[number] as `${K}Log`]: Omit<Logger, 'clear'>;
  } & {
    [K in T[number] as `${K}LogPath`]: string;
  };
}

// Now, instead of manually building logExports in a loop, we do:
// First, create your logExports using your helper function:
const logExports = createLogExports(logTypes) satisfies LogExports;

// Then, destructure logExports into individual named exports.
// We capture any extra keys with ...rest and force that it’s empty.
export const {
  updateLog,
  updateLogPath,
  mainLog,
  mainLogPath,
  scriptLog,
  scriptLogPath,
  windowLog,
  windowLogPath,
  kitLog,
  kitLogPath,
  debugLog,
  debugLogPath,
  consoleLog,
  consoleLogPath,
  workerLog,
  workerLogPath,
  keymapLog,
  keymapLogPath,
  shortcutsLog,
  shortcutsLogPath,
  scheduleLog,
  scheduleLogPath,
  snippetLog,
  snippetLogPath,
  scriptletLog,
  scriptletLogPath,
  watcherLog,
  watcherLogPath,
  errorLog,
  errorLogPath,
  promptLog,
  promptLogPath,
  processLog,
  processLogPath,
  widgetLog,
  widgetLogPath,
  themeLog,
  themeLogPath,
  healthLog,
  healthLogPath,
  systemLog,
  systemLogPath,
  backgroundLog,
  backgroundLogPath,
  serverLog,
  serverLogPath,
} = logExports;

// Helper type that enforces no extra keys remain.
type EnsureExhaustive<T> = keyof T extends never ? true : never;
// If rest is not empty, this assignment will cause a compile-time error.
const _exhaustivenessCheck: EnsureExhaustive<typeof rest> = true;
