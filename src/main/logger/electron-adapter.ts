/**
 * Electron Logger Adapter
 *
 * Bridges the shared logger interface with electron-log.
 * Provides structured logging, redaction, and correlation while
 * leveraging electron-log's file transport capabilities.
 */

import log, { type FileTransport, type LevelOption } from 'electron-log';
import { app } from 'electron';
import * as path from 'node:path';
import type {
  Logger,
  LogLevel,
  LogContext,
  LogEntry,
  LogTransport,
  LoggerOptions,
  TimerEndFn,
} from '@johnlindquist/kit/core/logger/types';
import {
  LOG_LEVEL_PRIORITY,
} from '@johnlindquist/kit/core/logger/types';
import {
  createRedactor,
  DEFAULT_REDACTION_PATHS,
} from '@johnlindquist/kit/core/logger/redaction';
import {
  getCorrelationId,
  getParentId,
} from '@johnlindquist/kit/core/logger/correlation';
import {
  JSONFormatter,
  PrettyFormatter,
  FileFormatter,
} from '@johnlindquist/kit/core/logger/formatters';

/**
 * Map our log levels to electron-log levels
 */
const LEVEL_MAP: Record<LogLevel, LevelOption> = {
  fatal: 'error',
  error: 'error',
  warn: 'warn',
  info: 'info',
  debug: 'debug',
  trace: 'silly',
};

/**
 * Map electron-log levels to our log levels
 */
const REVERSE_LEVEL_MAP: Record<string, LogLevel> = {
  error: 'error',
  warn: 'warn',
  info: 'info',
  debug: 'debug',
  verbose: 'debug',
  silly: 'trace',
};

/**
 * Options for creating an Electron logger
 */
export interface ElectronLoggerOptions extends LoggerOptions {
  /** Use structured JSON format (for production) */
  structured?: boolean;
  /** Enable file transport */
  fileTransport?: boolean;
  /** Enable console transport */
  consoleTransport?: boolean;
  /** Custom log file path */
  logPath?: string;
  /** Enable IPC transport (for renderer process) */
  ipcTransport?: boolean;
}

/**
 * Electron Logger Adapter
 * Implements our Logger interface while using electron-log under the hood
 */
export class ElectronLogger implements Logger {
  private name: string;
  private level: LogLevel;
  private defaultContext: LogContext;
  private electronLog: typeof log;
  private logPath: string;
  private redactor: ReturnType<typeof createRedactor>;
  private structured: boolean;
  private formatter: JSONFormatter | PrettyFormatter | FileFormatter;

  constructor(options: ElectronLoggerOptions) {
    this.name = options.name;
    this.level = options.level ?? 'info';
    this.defaultContext = {
      component: options.name,
      pid: process.pid,
      ...options.defaultContext,
    };
    this.structured = options.structured ?? (process.env.NODE_ENV === 'production');

    // Create redactor
    this.redactor = createRedactor({
      enabled: options.redaction?.enabled ?? true,
      paths: [...DEFAULT_REDACTION_PATHS, ...(options.redaction?.paths ?? [])],
    });

    // Create formatter based on mode
    this.formatter = this.structured
      ? new JSONFormatter()
      : new FileFormatter();

    // Create electron-log instance
    this.electronLog = log.create({ logId: options.name });

    // Set up log path
    this.logPath = options.logPath ?? path.resolve(
      app.getPath('logs'),
      `${options.name}.log`
    );

    // Configure file transport
    if (options.fileTransport !== false) {
      const fileTransport = this.electronLog.transports.file as FileTransport;
      fileTransport.resolvePathFn = () => this.logPath;
      fileTransport.level = LEVEL_MAP[this.level];

      if (this.structured) {
        // For structured logging, output raw JSON
        fileTransport.format = '{text}';
      } else {
        fileTransport.format = '[{y}-{m}-{d} {h}:{i}:{s}.{ms}] [{level}] {text}';
      }
    }

    // Configure console transport
    if (options.consoleTransport === false) {
      this.electronLog.transports.console.level = false;
    } else if (process.env.NODE_ENV === 'production') {
      this.electronLog.transports.console.level = false;
    }

    // Configure IPC transport
    if (this.electronLog.transports.ipc) {
      this.electronLog.transports.ipc.level = options.ipcTransport ? 'info' : false;
    }
  }

  getLevel(): LogLevel {
    return this.level;
  }

  setLevel(level: LogLevel): void {
    this.level = level;
    const electronLevel = LEVEL_MAP[level];
    (this.electronLog.transports.file as FileTransport).level = electronLevel;
  }

  isLevelEnabled(level: LogLevel): boolean {
    return LOG_LEVEL_PRIORITY[level] <= LOG_LEVEL_PRIORITY[this.level];
  }

  private createEntry(
    level: LogLevel,
    message: string,
    context?: LogContext,
    error?: Error
  ): LogEntry {
    const correlationId = getCorrelationId();
    const parentId = getParentId();

    const entry: LogEntry = {
      level,
      message,
      timestamp: new Date().toISOString(),
      context: {
        ...this.defaultContext,
        ...context,
        ...(correlationId && { correlationId }),
        ...(parentId && { parentId }),
      },
    };

    if (error) {
      entry.error = {
        name: error.name,
        message: error.message,
        stack: error.stack,
        code: (error as NodeJS.ErrnoException).code,
        cause: error.cause,
      };
    }

    return entry;
  }

  private writeLog(entry: LogEntry): void {
    // Redact sensitive data
    const redactedEntry = this.redactor.redact(entry);

    // Format the entry
    const formatted = this.formatter.format(redactedEntry);

    // Get the electron-log level
    const electronLevel = LEVEL_MAP[entry.level];

    // Write to electron-log
    switch (electronLevel) {
      case 'error':
        this.electronLog.error(formatted);
        break;
      case 'warn':
        this.electronLog.warn(formatted);
        break;
      case 'info':
        this.electronLog.info(formatted);
        break;
      case 'debug':
        this.electronLog.debug(formatted);
        break;
      case 'silly':
        this.electronLog.silly(formatted);
        break;
      default:
        this.electronLog.info(formatted);
    }
  }

  private log(
    level: LogLevel,
    message: string,
    errorOrContext?: Error | LogContext,
    context?: LogContext
  ): void {
    if (!this.isLevelEnabled(level)) return;

    let error: Error | undefined;
    let ctx: LogContext | undefined;

    if (errorOrContext instanceof Error) {
      error = errorOrContext;
      ctx = context;
    } else {
      ctx = errorOrContext;
    }

    const entry = this.createEntry(level, message, ctx, error);
    this.writeLog(entry);
  }

  fatal(message: string, errorOrContext?: Error | LogContext, context?: LogContext): void {
    this.log('fatal', message, errorOrContext, context);
  }

  error(message: string, errorOrContext?: Error | LogContext, context?: LogContext): void {
    this.log('error', message, errorOrContext, context);
  }

  warn(message: string, context?: LogContext): void {
    this.log('warn', message, context);
  }

  info(message: string, context?: LogContext): void {
    this.log('info', message, context);
  }

  debug(message: string, context?: LogContext): void {
    this.log('debug', message, context);
  }

  trace(message: string, context?: LogContext): void {
    this.log('trace', message, context);
  }

  child(context: LogContext): Logger {
    const childLogger = new ElectronLogger({
      name: this.name,
      level: this.level,
      defaultContext: { ...this.defaultContext, ...context },
      structured: this.structured,
      logPath: this.logPath,
    });
    return childLogger;
  }

  startTimer(operationName: string, context?: LogContext): TimerEndFn {
    const startTime = performance.now();

    return () => {
      const duration = performance.now() - startTime;
      this.debug(`${operationName} completed`, {
        ...context,
        duration,
        operationName,
      });
      return duration;
    };
  }

  /**
   * Get the log file path
   */
  getLogPath(): string {
    return this.logPath;
  }

  /**
   * Clear the log file
   */
  clear(): void {
    const fs = require('node:fs');
    try {
      fs.writeFileSync(this.logPath, '');
    } catch (error) {
      // Ignore errors
    }
  }

  /**
   * Get the underlying electron-log instance for advanced usage
   */
  getElectronLog(): typeof log {
    return this.electronLog;
  }
}

/**
 * Create an Electron logger
 */
export function createElectronLogger(options: ElectronLoggerOptions): ElectronLogger {
  return new ElectronLogger(options);
}

/**
 * Domain-based logger configuration
 * Groups related log categories into domains for easier management
 */
export const DOMAIN_CONFIG: Record<string, {
  categories: string[];
  level: LogLevel;
  description: string;
}> = {
  core: {
    categories: ['main', 'kit', 'system', 'health'],
    level: 'info',
    description: 'Core application functionality',
  },
  window: {
    categories: ['window', 'prompt', 'widget', 'theme'],
    level: 'info',
    description: 'Window and UI management',
  },
  process: {
    categories: ['process', 'script', 'background', 'worker'],
    level: 'info',
    description: 'Process and script execution',
  },
  input: {
    categories: ['keyboard', 'shortcuts', 'io', 'keymap', 'snippet', 'scriptlet'],
    level: 'info',
    description: 'User input handling',
  },
  communication: {
    categories: ['ipc', 'messages', 'server', 'mcp'],
    level: 'info',
    description: 'Inter-process and network communication',
  },
  scheduling: {
    categories: ['schedule', 'tick', 'watcher', 'metadataWatcher', 'chokidar'],
    level: 'info',
    description: 'Scheduled tasks and file watching',
  },
  terminal: {
    categories: ['term', 'console'],
    level: 'info',
    description: 'Terminal and console output',
  },
  diagnostic: {
    categories: ['debug', 'error', 'search', 'compare', 'update', 'processWindowCoordinator'],
    level: 'debug',
    description: 'Diagnostics and debugging',
  },
};

/**
 * Get the domain for a category
 */
export function getDomainForCategory(category: string): string {
  for (const [domain, config] of Object.entries(DOMAIN_CONFIG)) {
    if (config.categories.includes(category)) {
      return domain;
    }
  }
  return 'core'; // Default domain
}

/**
 * Create domain-based loggers
 * Returns a map of domain name to logger instance
 */
export function createDomainLoggers(
  options: Partial<ElectronLoggerOptions> = {}
): Map<string, ElectronLogger> {
  const loggers = new Map<string, ElectronLogger>();

  for (const [domain, config] of Object.entries(DOMAIN_CONFIG)) {
    const logger = createElectronLogger({
      name: domain,
      level: config.level,
      structured: options.structured,
      ...options,
    });
    loggers.set(domain, logger);
  }

  return loggers;
}

/**
 * Legacy compatibility layer
 * Provides the same API as the current logs.ts exports
 */
export interface LegacyLogger {
  info: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
  verbose: (...args: unknown[]) => void;
  debug: (...args: unknown[]) => void;
  silly: (...args: unknown[]) => void;
  clear: () => void;
  logPath: string;
}

/**
 * Create a legacy-compatible logger
 * This can be used as a drop-in replacement for the current category loggers
 */
export function createLegacyLogger(name: string): LegacyLogger {
  const logger = createElectronLogger({
    name,
    level: 'debug',
    structured: process.env.NODE_ENV === 'production',
  });

  return {
    info: (...args: unknown[]) => logger.info(args.join(' ')),
    warn: (...args: unknown[]) => logger.warn(args.join(' ')),
    error: (...args: unknown[]) => logger.error(args.join(' ')),
    verbose: (...args: unknown[]) => logger.debug(args.join(' ')),
    debug: (...args: unknown[]) => logger.debug(args.join(' ')),
    silly: (...args: unknown[]) => logger.trace(args.join(' ')),
    clear: () => logger.clear(),
    logPath: logger.getLogPath(),
  };
}
