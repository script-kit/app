/**
 * Logger exports
 *
 * This module provides backward-compatible logger exports that bridge to
 * the new domain-based logging system. All old category loggers (mainLog,
 * promptLog, etc.) are now mapped to their respective domain loggers.
 *
 * Domain mapping:
 * - core: main, kit, system, health
 * - window: window, prompt, widget, theme
 * - process: process, script, background, worker
 * - input: keyboard, shortcuts, io, keymap, snippet, scriptlet
 * - communication: ipc, messages, server, mcp
 * - scheduling: schedule, tick, watcher, metadataWatcher, chokidar
 * - terminal: term, console
 * - diagnostic: debug, error, search, compare, update, processWindowCoordinator
 */

import fs from "node:fs";
import { getLogFromScriptPath } from "@johnlindquist/kit/core/utils";
import { app } from "electron";
import log, { type FileTransport, type LevelOption } from "electron-log";
import { subscribeKey } from "valtio/utils";
import { kitState, subs } from "./state";
import { TrackEvent, trackEvent } from "./track";
import {
  getCoreLogger,
  getWindowLogger,
  getProcessLogger,
  getInputLogger,
  getCommunicationLogger,
  getSchedulingLogger,
  getTerminalLogger,
  getDiagnosticLogger,
  initializeDomainLoggers,
} from "./logger/domain-loggers";

// Initialize domain loggers on import
initializeDomainLoggers();

const isDev = process.env.NODE_ENV === "development";

if (isDev) {
  const logsPath = app.getPath("logs").replace("Electron", "Kit");
  app.setAppLogsPath(logsPath);
}

// Initialize logging system startup message
getCoreLogger().info("Script Kit Starting Up...");

// ============================================================================
// Legacy Logger Interface
// ============================================================================

type logInfoArgs = Parameters<typeof log.info>;

export interface Logger {
  info: (...args: logInfoArgs) => void;
  warn: (...args: logInfoArgs) => void;
  error: (...args: logInfoArgs) => void;
  verbose: (...args: logInfoArgs) => void;
  debug: (...args: logInfoArgs) => void;
  silly: (...args: logInfoArgs) => void;
  clear: () => void;
}

type LoggerWithPath = Logger & { logPath: string };
type LogMap = Map<string, LoggerWithPath>;
export const logMap: LogMap = new Map<string, LoggerWithPath>();

/**
 * Get a script-specific logger (for user scripts)
 */
export const getLog = (scriptPath: string): LoggerWithPath => {
  const existing = logMap.get(scriptPath);
  if (existing) {
    return existing;
  }

  try {
    const scriptLog = log.create({ logId: scriptPath });
    const logPath = getLogFromScriptPath(scriptPath);
    getCoreLogger().info(`Log path: ${logPath}`);

    const fileTransport = scriptLog.transports.file as FileTransport;
    fileTransport.resolvePathFn = () => logPath;
    fileTransport.level = kitState.logLevel;

    // Generic wrapper to catch errors in logging functions
    const wrap = <T extends unknown[]>(
      fn: (...args: T) => void,
    ): ((...args: T) => void) => {
      return (...args: T): void => {
        try {
          fn(...args);
        } catch (error: unknown) { }
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
        fs.writeFileSync(logPath, "");
      },
      logPath,
    };

    logMap.set(scriptPath, logger);
    return logger;
  } catch (error) {
    // Fallback logger using console
    const consoleLogFn = console.log;
    const consoleWarn = console.warn;
    const consoleError = console.error;

    const fallbackLogger: Logger & { logPath: string } = {
      info: (...args: Parameters<typeof log.info>) =>
        consoleLogFn(...args),
      warn: (...args: Parameters<typeof log.warn>) =>
        consoleWarn(...args),
      error: (...args: Parameters<typeof log.error>) =>
        consoleError(...args),
      verbose: (...args: Parameters<typeof log.verbose>) =>
        consoleLogFn(...args),
      debug: (...args: Parameters<typeof log.debug>) =>
        consoleLogFn(...args),
      silly: (...args: Parameters<typeof log.silly>) =>
        consoleLogFn(...args),
      clear: () => { },
      logPath: "",
    };
    return fallbackLogger;
  }
};

/**
 * Legacy warn function
 */
export const warn = (message: string): void => {
  getCoreLogger().warn(message);
};

// ============================================================================
// Track errors for analytics
// ============================================================================

// Subscribe to log level changes
const subLogLevel = subscribeKey(kitState, "logLevel", (level: LevelOption) => {
  getCoreLogger().info(`Log level set to: ${level}`);
});
subs.push(subLogLevel);

// ============================================================================
// Domain Logger Exports (bridged to new system)
// ============================================================================

// Core domain: main, kit, system, health
export const mainLog = getCoreLogger();
export const kitLog = getCoreLogger();
export const systemLog = getCoreLogger();
export const healthLog = getCoreLogger();

// Window domain: window, prompt, widget, theme
export const windowLog = getWindowLogger();
export const promptLog = getWindowLogger();
export const widgetLog = getWindowLogger();
export const themeLog = getWindowLogger();

// Process domain: process, script, background, worker
export const processLog = getProcessLogger();
export const scriptLog = getProcessLogger();
export const backgroundLog = getProcessLogger();
export const workerLog = getProcessLogger();

// Input domain: keyboard, shortcuts, io, keymap, snippet, scriptlet
export const keyboardLog = getInputLogger();
export const shortcutsLog = getInputLogger();
export const ioLog = getInputLogger();
export const keymapLog = getInputLogger();
export const snippetLog = getInputLogger();
export const scriptletLog = getInputLogger();

// Communication domain: ipc, messages, server, mcp
export const ipcLog = getCommunicationLogger();
export const messagesLog = getCommunicationLogger();
export const serverLog = getCommunicationLogger();
export const mcpLog = getCommunicationLogger();

// Scheduling domain: schedule, tick, watcher, metadataWatcher, chokidar
export const scheduleLog = getSchedulingLogger();
export const tickLog = getSchedulingLogger();
export const watcherLog = getSchedulingLogger();
export const metadataWatcherLog = getSchedulingLogger();
export const chokidarLog = getSchedulingLogger();

// Terminal domain: term, console
export const termLog = getTerminalLogger();
export const consoleLog = getTerminalLogger();

// Diagnostic domain: debug, error, search, compare, update, processWindowCoordinator
export const debugLog = getDiagnosticLogger();
export const errorLog = getDiagnosticLogger();
export const searchLog = getDiagnosticLogger();
export const compareLog = getDiagnosticLogger();
export const updateLog = getDiagnosticLogger();
export const processWindowCoordinatorLog = getDiagnosticLogger();

// ============================================================================
// Log Paths (for compatibility - point to domain log files)
// ============================================================================

import * as path from "node:path";

const logsDir = app.getPath("logs");

export const mainLogPath = path.resolve(logsDir, "core.log");
export const kitLogPath = path.resolve(logsDir, "core.log");
export const systemLogPath = path.resolve(logsDir, "core.log");
export const healthLogPath = path.resolve(logsDir, "core.log");

export const windowLogPath = path.resolve(logsDir, "window.log");
export const promptLogPath = path.resolve(logsDir, "window.log");
export const widgetLogPath = path.resolve(logsDir, "window.log");
export const themeLogPath = path.resolve(logsDir, "window.log");

export const processLogPath = path.resolve(logsDir, "process.log");
export const scriptLogPath = path.resolve(logsDir, "process.log");
export const backgroundLogPath = path.resolve(logsDir, "process.log");
export const workerLogPath = path.resolve(logsDir, "process.log");

export const keyboardLogPath = path.resolve(logsDir, "input.log");
export const shortcutsLogPath = path.resolve(logsDir, "input.log");
export const ioLogPath = path.resolve(logsDir, "input.log");
export const keymapLogPath = path.resolve(logsDir, "input.log");
export const snippetLogPath = path.resolve(logsDir, "input.log");
export const scriptletLogPath = path.resolve(logsDir, "input.log");

export const ipcLogPath = path.resolve(logsDir, "communication.log");
export const messagesLogPath = path.resolve(logsDir, "communication.log");
export const serverLogPath = path.resolve(logsDir, "communication.log");
export const mcpLogPath = path.resolve(logsDir, "communication.log");

export const scheduleLogPath = path.resolve(logsDir, "scheduling.log");
export const tickLogPath = path.resolve(logsDir, "scheduling.log");
export const watcherLogPath = path.resolve(logsDir, "scheduling.log");
export const metadataWatcherLogPath = path.resolve(logsDir, "scheduling.log");
export const chokidarLogPath = path.resolve(logsDir, "scheduling.log");

export const termLogPath = path.resolve(logsDir, "terminal.log");
export const consoleLogPath = path.resolve(logsDir, "terminal.log");

export const debugLogPath = path.resolve(logsDir, "diagnostic.log");
export const errorLogPath = path.resolve(logsDir, "diagnostic.log");
export const searchLogPath = path.resolve(logsDir, "diagnostic.log");
export const compareLogPath = path.resolve(logsDir, "diagnostic.log");
export const updateLogPath = path.resolve(logsDir, "diagnostic.log");
export const processWindowCoordinatorLogPath = path.resolve(logsDir, "diagnostic.log");

// Re-export perf logging utility (separate module with specialized API)
export { perf, perfLogPath } from './perf';
