import log from 'electron-log';

const ignoredPrefixes = new Set<string>(process.env.KIT_LOG_IGNORE_PREFIX?.split(',') || []);
const filteredPrefixes = new Set<string>(process.env.KIT_LOG_FILTER_PREFIX?.split(',') || []);

function isLoggerDisabled(prefix: string): boolean {
  return (filteredPrefixes.size > 0 && !filteredPrefixes.has(prefix)) || ignoredPrefixes.has(prefix);
}

export class Logger {
  private prefix: string;
  private disabled = false;
  public off = false;

  constructor(prefix: string) {
    this.prefix = prefix;
    this.disabled = isLoggerDisabled(prefix);
  }

  info(...args: any[]) {
    if (!(this.disabled || this.off)) {
      log.info(`${this.prefix}:`, ...args);
    }
  }

  warn(...args: any[]) {
    if (!(this.disabled || this.off)) {
      log.warn(`${this.prefix}:`, ...args);
    }
  }

  err(...args: any[]) {
    if (!(this.disabled || this.off)) {
      log.error(`${this.prefix}:`, ...args);
    }
  }

  verbose(...args: any[]) {
    if (!(this.disabled || this.off)) {
      log.verbose(`${this.prefix}:`, ...args);
    }
  }

  debug(...args: any[]) {
    if (!(this.disabled || this.off)) {
      log.debug(`${this.prefix}:`, ...args);
    }
  }

  silly(...args: any[]) {
    if (!(this.disabled || this.off)) {
      log.silly(`${this.prefix}:`, ...args);
    }
  }

  // TODO: Need to reach across the electron-log/renderer bounds to disable them too
  only(...args: any[]) {
    // Disable all other loggers
    for (const [prefix, logger] of loggers) {
      logger.off = true;
    }

    this.off = true;

    log.info(`${this.prefix}:`, ...args);
  }
}

const loggers = new Map<string, Logger>();

export function createLogger(prefix: string): Logger {
  if (loggers.has(prefix)) {
    const existingLogger = loggers.get(prefix);
    if (existingLogger) {
      return existingLogger;
    }
  }
  const logger = new Logger(prefix);
  loggers.set(prefix, logger);
  return logger;
}
