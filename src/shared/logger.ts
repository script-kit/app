export interface LogTransport {
  info(...args: any[]): void;
  warn(...args: any[]): void;
  error(...args: any[]): void;
  verbose(...args: any[]): void;
  debug(...args: any[]): void;
  silly(...args: any[]): void;
}

export class Logger {
  private prefix: string;
  private disabled = false;
  public off = false;
  private log: LogTransport;
  private loggerRegistry: Map<string, Logger>;

  constructor(prefix: string, log: LogTransport, loggerRegistry: Map<string, Logger>, isDisabled: boolean) {
    this.prefix = prefix;
    this.log = log;
    this.loggerRegistry = loggerRegistry;
    this.disabled = isDisabled;
  }

  info(...args: any[]) {
    if (!(this.disabled || this.off)) {
      this.log.info(`${this.prefix}:`, ...args);
    }
  }

  warn(...args: any[]) {
    if (!(this.disabled || this.off)) {
      this.log.warn(`${this.prefix}:`, ...args);
    }
  }

  error(...args: any[]) {
    if (!(this.disabled || this.off)) {
      this.log.error(`${this.prefix}:`, ...args);
    }
  }

  verbose(...args: any[]) {
    if (!(this.disabled || this.off)) {
      this.log.verbose(`${this.prefix}:`, ...args);
    }
  }

  debug(...args: any[]) {
    if (!(this.disabled || this.off)) {
      this.log.debug(`${this.prefix}:`, ...args);
    }
  }

  silly(...args: any[]) {
    if (!(this.disabled || this.off)) {
      this.log.silly(`${this.prefix}:`, ...args);
    }
  }

  green(...args: any[]) {
    if (!(this.disabled || this.off)) {
      this.log.info(`\x1b[32m${this.prefix}:\x1b[0m`, ...args);
    }
  }

  yellow(...args: any[]) {
    if (!(this.disabled || this.off)) {
      this.log.info(`\x1b[33m${this.prefix}:\x1b[0m`, ...args);
    }
  }

  purple(...args: any[]) {
    if (!(this.disabled || this.off)) {
      this.log.info(`\x1b[35m${this.prefix}:\x1b[0m`, ...args);
    }
  }

  red(...args: any[]) {
    if (!(this.disabled || this.off)) {
      this.log.info(`\x1b[31m${this.prefix}:\x1b[0m`, ...args);
    }
  }

  // TODO: Need to reach across the electron-log bounds to disable them too
  only(...args: any[]) {
    // Disable all other loggers
    for (const [, logger] of this.loggerRegistry) {
      logger.off = true;
    }

    this.off = true;

    this.log.info(`${this.prefix}:`, ...args);
  }
}

export function createLoggerFactory(log: LogTransport) {
  const loggers = new Map<string, Logger>();

  let ignoredPrefixes: string[] = [];
  let filteredPrefixes: string[] = [];

  if (typeof process !== 'undefined' && process?.env) {
    ignoredPrefixes = process.env.KIT_LOG_IGNORE_PREFIX?.split(',') || [];
    filteredPrefixes = process.env.KIT_LOG_FILTER_PREFIX?.split(',') || [];
  }

  function isLoggerDisabled(prefix: string): boolean {
    return (filteredPrefixes.length > 0 && !filteredPrefixes.includes(prefix)) || ignoredPrefixes.includes(prefix);
  }

  return function createLogger(prefix: string): Logger {
    if (loggers.has(prefix)) {
      const existingLogger = loggers.get(prefix);
      if (existingLogger) {
        return existingLogger;
      }
    }
    const logger = new Logger(prefix, log, loggers, isLoggerDisabled(prefix));
    loggers.set(prefix, logger);
    return logger;
  };
}
