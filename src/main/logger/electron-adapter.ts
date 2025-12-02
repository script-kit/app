/**
 * Electron Logger Adapter
 *
 * Self-contained logger for the Electron app that provides structured logging,
 * redaction, and correlation while leveraging electron-log's file transport.
 *
 * This module is intentionally self-contained to avoid dependency issues
 * with the SDK's logger module which doesn't export TypeScript declarations.
 */

import * as path from 'node:path';
import { app } from 'electron';
import log, { type FileTransport, type LevelOption } from 'electron-log';

// ============================================================================
// Types (self-contained to avoid SDK import issues)
// ============================================================================

/**
 * Log levels in order of severity
 */
export type LogLevel = 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace';

/**
 * Priority map for log levels (lower = more severe)
 */
export const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  fatal: 0,
  error: 1,
  warn: 2,
  info: 3,
  debug: 4,
  trace: 5,
};

/**
 * Context attached to log entries
 */
export interface LogContext {
  [key: string]: unknown;
  component?: string;
  pid?: number;
  correlationId?: string;
  parentId?: string;
}

/**
 * Structured log entry
 */
export interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: string;
  context?: LogContext;
  error?: {
    name: string;
    message: string;
    stack?: string;
    code?: string;
    cause?: unknown;
  };
}

/**
 * Timer end function type
 */
export type TimerEndFn = () => number;

/**
 * Logger interface
 */
export interface Logger {
  fatal(message: string, errorOrContext?: Error | LogContext, context?: LogContext): void;
  error(message: string, errorOrContext?: Error | LogContext, context?: LogContext): void;
  warn(...args: unknown[]): void;
  info(...args: unknown[]): void;
  debug(...args: unknown[]): void;
  trace(...args: unknown[]): void;
  verbose(...args: unknown[]): void;
  silly(...args: unknown[]): void;
  child(context: LogContext): Logger;
  startTimer(operationName: string, context?: LogContext): TimerEndFn;
  getLevel(): LogLevel;
  setLevel(level: LogLevel): void;
  isLevelEnabled(level: LogLevel): boolean;
}

/**
 * Logger options
 */
export interface LoggerOptions {
  name: string;
  level?: LogLevel;
  defaultContext?: LogContext;
  redaction?: {
    enabled?: boolean;
    paths?: string[];
  };
}

// ============================================================================
// Redaction (self-contained)
// ============================================================================

/**
 * Default paths to redact
 */
export const DEFAULT_REDACTION_PATHS = [
  'password',
  'secret',
  'token',
  'apiKey',
  'api_key',
  'authorization',
  'auth',
  'credential',
  'privateKey',
  'private_key',
  'accessToken',
  'access_token',
  'refreshToken',
  'refresh_token',
  'sessionId',
  'session_id',
  'cookie',
  'ssn',
  'creditCard',
  'credit_card',
  'cardNumber',
  'card_number',
  'cvv',
  'pin',
];

/**
 * Redaction configuration
 */
export interface RedactionConfig {
  enabled?: boolean;
  paths?: string[];
  replacement?: string;
}

/**
 * Check if a key should be redacted
 */
function shouldRedact(key: string, paths: string[]): boolean {
  const lowerKey = key.toLowerCase();
  return paths.some((path) => {
    const lowerPath = path.toLowerCase();
    return lowerKey === lowerPath || lowerKey.includes(lowerPath) || lowerPath.includes(lowerKey);
  });
}

/**
 * Recursively redact sensitive values in an object
 */
function redactObject(obj: unknown, paths: string[], replacement: string): unknown {
  if (obj === null || obj === undefined) {
    return obj;
  }

  if (typeof obj === 'string') {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => redactObject(item, paths, replacement));
  }

  if (typeof obj === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      if (shouldRedact(key, paths)) {
        result[key] = replacement;
      } else {
        result[key] = redactObject(value, paths, replacement);
      }
    }
    return result;
  }

  return obj;
}

/**
 * Create a redactor function
 */
export function createRedactor(config: RedactionConfig = {}) {
  const enabled = config.enabled ?? true;
  const paths = [...DEFAULT_REDACTION_PATHS, ...(config.paths ?? [])];
  const replacement = config.replacement ?? '[REDACTED]';

  return {
    redact: <T>(data: T): T => {
      if (!enabled) return data;
      return redactObject(data, paths, replacement) as T;
    },
  };
}

// ============================================================================
// Correlation (simplified - no AsyncLocalStorage in Electron main process)
// ============================================================================

let currentCorrelationId: string | undefined;
let currentParentId: string | undefined;

/**
 * Get current correlation ID
 */
export function getCorrelationId(): string | undefined {
  return currentCorrelationId;
}

/**
 * Get current parent ID
 */
export function getParentId(): string | undefined {
  return currentParentId;
}

/**
 * Set correlation context
 */
export function setCorrelationContext(correlationId: string, parentId?: string): void {
  currentCorrelationId = correlationId;
  currentParentId = parentId;
}

/**
 * Clear correlation context
 */
export function clearCorrelationContext(): void {
  currentCorrelationId = undefined;
  currentParentId = undefined;
}

// ============================================================================
// Formatters (self-contained)
// ============================================================================

/**
 * Format a log entry as JSON
 */
export class JSONFormatter {
  format(entry: LogEntry): string {
    return JSON.stringify(entry);
  }
}

/**
 * Format a log entry for file output
 */
export class FileFormatter {
  format(entry: LogEntry): string {
    const { level, message, timestamp, context, error } = entry;
    let output = `[${timestamp}] [${level.toUpperCase()}]`;

    if (context?.component) {
      output += ` [${context.component}]`;
    }

    output += ` ${message}`;

    // Add context (excluding already shown fields)
    // Guard: Only process context if it's actually an object (not a string or primitive)
    if (context && typeof context === 'object' && !Array.isArray(context)) {
      const { component, ...rest } = context;
      if (Object.keys(rest).length > 0) {
        output += ` ${JSON.stringify(rest)}`;
      }
    }

    // Add error if present
    if (error) {
      output += `\n  Error: ${error.name}: ${error.message}`;
      if (error.stack) {
        output += `\n  Stack: ${error.stack}`;
      }
    }

    return output;
  }
}

/**
 * Format a log entry with colors for console
 */
export class PrettyFormatter {
  private colors: Record<LogLevel, string> = {
    fatal: '\x1b[41m\x1b[37m', // Red background, white text
    error: '\x1b[31m', // Red
    warn: '\x1b[33m', // Yellow
    info: '\x1b[36m', // Cyan
    debug: '\x1b[35m', // Magenta
    trace: '\x1b[90m', // Gray
  };

  private reset = '\x1b[0m';

  format(entry: LogEntry): string {
    const { level, message, timestamp, context, error } = entry;
    const color = this.colors[level] || '';

    let output = `${color}[${level.toUpperCase()}]${this.reset}`;

    if (context?.component) {
      output += ` \x1b[34m[${context.component}]\x1b[0m`;
    }

    output += ` ${message}`;

    if (error) {
      output += `\n  ${color}Error: ${error.name}: ${error.message}${this.reset}`;
    }

    return output;
  }
}

// ============================================================================
// Electron Logger
// ============================================================================

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
    this.structured = options.structured ?? process.env.NODE_ENV === 'production';

    // Create redactor
    this.redactor = createRedactor({
      enabled: options.redaction?.enabled ?? true,
      paths: [...DEFAULT_REDACTION_PATHS, ...(options.redaction?.paths ?? [])],
    });

    // Create formatter based on mode
    this.formatter = this.structured ? new JSONFormatter() : new FileFormatter();

    // Create electron-log instance
    this.electronLog = log.create({ logId: options.name });

    // Set up log path
    this.logPath = options.logPath ?? path.resolve(app.getPath('logs'), `${options.name}.log`);

    // Configure file transport
    if (options.fileTransport !== false) {
      const fileTransport = this.electronLog.transports.file as FileTransport;
      fileTransport.resolvePathFn = () => this.logPath;
      fileTransport.level = LEVEL_MAP[this.level];

      // Always use raw text format - our formatter already includes timestamp and level
      // This prevents duplicate timestamps like: [2025-11-24 20:29:59.298] [info] [2025-11-25T03:29:59.298Z] [INFO]
      fileTransport.format = '{text}';
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

  private createEntry(level: LogLevel, message: string, context?: LogContext, error?: Error): LogEntry {
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
        cause: (error as any).cause,
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

  private log(level: LogLevel, message: string, errorOrContext?: Error | LogContext, context?: LogContext): void {
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

  /**
   * Warning logging
   * Accepts multiple arguments like electron-log for backward compatibility
   */
  warn(...args: unknown[]): void {
    // Early exit if level not enabled (avoid formatting work)
    if (!this.isLevelEnabled('warn') || args.length === 0) return;

    // Check if last argument is a LogContext object
    const lastArg = args[args.length - 1];
    const hasContext = lastArg && typeof lastArg === 'object' && !Array.isArray(lastArg) && !(lastArg instanceof Error);

    let context: LogContext | undefined;
    let messageArgs: unknown[];

    if (hasContext && args.length > 1) {
      context = lastArg as LogContext;
      messageArgs = args.slice(0, -1);
    } else {
      messageArgs = args;
    }

    const message = messageArgs.map((arg) => (typeof arg === 'object' ? JSON.stringify(arg) : String(arg))).join(' ');

    this.log('warn', message, context);
  }

  /**
   * Info logging
   * Accepts multiple arguments like electron-log for backward compatibility
   */
  info(...args: unknown[]): void {
    // Early exit if level not enabled (avoid formatting work)
    if (!this.isLevelEnabled('info') || args.length === 0) return;

    // Check if last argument is a LogContext object
    const lastArg = args[args.length - 1];
    const hasContext = lastArg && typeof lastArg === 'object' && !Array.isArray(lastArg) && !(lastArg instanceof Error);

    let context: LogContext | undefined;
    let messageArgs: unknown[];

    if (hasContext && args.length > 1) {
      context = lastArg as LogContext;
      messageArgs = args.slice(0, -1);
    } else {
      messageArgs = args;
    }

    const message = messageArgs.map((arg) => (typeof arg === 'object' ? JSON.stringify(arg) : String(arg))).join(' ');

    this.log('info', message, context);
  }

  /**
   * Debug logging
   * Accepts multiple arguments like electron-log for backward compatibility
   */
  debug(...args: unknown[]): void {
    // Early exit if level not enabled (avoid formatting work)
    if (!this.isLevelEnabled('debug') || args.length === 0) return;

    // Check if last argument is a LogContext object
    const lastArg = args[args.length - 1];
    const hasContext = lastArg && typeof lastArg === 'object' && !Array.isArray(lastArg) && !(lastArg instanceof Error);

    let context: LogContext | undefined;
    let messageArgs: unknown[];

    if (hasContext && args.length > 1) {
      context = lastArg as LogContext;
      messageArgs = args.slice(0, -1);
    } else {
      messageArgs = args;
    }

    const message = messageArgs.map((arg) => (typeof arg === 'object' ? JSON.stringify(arg) : String(arg))).join(' ');

    this.log('debug', message, context);
  }

  /**
   * Trace logging
   * Accepts multiple arguments like electron-log for backward compatibility
   */
  trace(...args: unknown[]): void {
    // Early exit if level not enabled (avoid formatting work)
    if (!this.isLevelEnabled('trace') || args.length === 0) return;

    // Check if last argument is a LogContext object
    const lastArg = args[args.length - 1];
    const hasContext = lastArg && typeof lastArg === 'object' && !Array.isArray(lastArg) && !(lastArg instanceof Error);

    let context: LogContext | undefined;
    let messageArgs: unknown[];

    if (hasContext && args.length > 1) {
      context = lastArg as LogContext;
      messageArgs = args.slice(0, -1);
    } else {
      messageArgs = args;
    }

    const message = messageArgs.map((arg) => (typeof arg === 'object' ? JSON.stringify(arg) : String(arg))).join(' ');

    this.log('trace', message, context);
  }

  /**
   * Verbose logging (alias for debug, for electron-log compatibility)
   * Accepts multiple arguments like electron-log for backward compatibility
   */
  verbose(...args: unknown[]): void {
    // Early exit if level not enabled (avoid formatting work)
    if (!this.isLevelEnabled('debug') || args.length === 0) return;
    const message = args.map((arg) => (typeof arg === 'object' ? JSON.stringify(arg) : String(arg))).join(' ');
    this.log('debug', message);
  }

  /**
   * Silly logging (alias for trace, for electron-log compatibility)
   * Accepts multiple arguments like electron-log for backward compatibility
   */
  silly(...args: unknown[]): void {
    // Early exit if level not enabled (avoid formatting work)
    if (!this.isLevelEnabled('trace') || args.length === 0) return;
    const message = args.map((arg) => (typeof arg === 'object' ? JSON.stringify(arg) : String(arg))).join(' ');
    this.log('trace', message);
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
export const DOMAIN_CONFIG: Record<
  string,
  {
    categories: string[];
    level: LogLevel;
    description: string;
  }
> = {
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
export function createDomainLoggers(options: Partial<ElectronLoggerOptions> = {}): Map<string, ElectronLogger> {
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
