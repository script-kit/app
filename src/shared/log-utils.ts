import log from 'electron-log';

const ignoredPrefixes = new Set<string>(process.env.KIT_LOG_IGNORE_PREFIX?.split(',') || []);
const filteredPrefixes = new Set<string>(process.env.KIT_LOG_FILTER_PREFIX?.split(',') || []);

function isLoggerDisabled(prefix: string): boolean {
  return (filteredPrefixes.size > 0 && !filteredPrefixes.has(prefix)) || ignoredPrefixes.has(prefix);
}

function createInfoLogger(prefix: string) {
  return (...args: any[]) => {
    log.info(`${prefix}:`, ...args);
  };
}
function createWarnLogger(prefix: string) {
  return (...args: any[]) => {
    log.warn(`${prefix}:`, ...args);
  };
}

function createErrorLogger(prefix: string) {
  return (...args: any[]) => {
    log.error(`${prefix}:`, ...args);
  };
}

function createVerboseLogger(prefix: string) {
  return (...args: any[]) => {
    log.verbose(`${prefix}:`, ...args);
  };
}

function createDebugLogger(prefix: string) {
  return (...args: any[]) => {
    log.debug(`${prefix}:`, ...args);
  };
}

function createSillyLogger(prefix: string) {
  return (...args: any[]) => {
    log.silly(`${prefix}:`, ...args);
  };
}

export function createLogger(prefix: string) {
  if (isLoggerDisabled(prefix)) {
    return {
      info: () => {},
      warn: () => {},
      err: () => {},
      verbose: () => {},
      debug: () => {},
      silly: () => {},
    };
  }
  return {
    info: createInfoLogger(prefix),
    warn: createWarnLogger(prefix),
    err: createErrorLogger(prefix),
    verbose: createVerboseLogger(prefix),
    debug: createDebugLogger(prefix),
    silly: createSillyLogger(prefix),
  };
}
