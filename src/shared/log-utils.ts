import log from 'electron-log';

const disabledPrefixes = new Set<string>([]);

function createInfoLogger(prefix: string) {
  if (disabledPrefixes.has(prefix)) {
    return () => {};
  }
  return (...args: any[]) => {
    log.info(`${prefix}:`, ...args);
  };
}
function createWarnLogger(prefix: string) {
  if (disabledPrefixes.has(prefix)) {
    return () => {};
  }
  return (...args: any[]) => {
    log.warn(`${prefix}:`, ...args);
  };
}

function createErrorLogger(prefix: string) {
  if (disabledPrefixes.has(prefix)) {
    return () => {};
  }
  return (...args: any[]) => {
    log.error(`${prefix}:`, ...args);
  };
}

function createVerboseLogger(prefix: string) {
  if (disabledPrefixes.has(prefix)) {
    return () => {};
  }
  return (...args: any[]) => {
    log.verbose(`${prefix}:`, ...args);
  };
}

function createDebugLogger(prefix: string) {
  if (disabledPrefixes.has(prefix)) {
    return () => {};
  }
  return (...args: any[]) => {
    log.debug(`${prefix}:`, ...args);
  };
}

function createSillyLogger(prefix: string) {
  if (disabledPrefixes.has(prefix)) {
    return () => {};
  }
  return (...args: any[]) => {
    log.silly(`${prefix}:`, ...args);
  };
}

export function createLogger(prefix: string) {
  return {
    info: createInfoLogger(prefix),
    warn: createWarnLogger(prefix),
    err: createErrorLogger(prefix),
    verbose: createVerboseLogger(prefix),
    debug: createDebugLogger(prefix),
    silly: createSillyLogger(prefix),
  };
}
