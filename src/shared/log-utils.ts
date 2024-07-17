import log from 'electron-log';

const disabledPrefixes = new Set<string>([]);

function createInfoLogger(prefix: string) {
  if (disabledPrefixes.has(prefix)) {
    return () => {};
  }
  return (message: string, ...args: any[]) => {
    log.info(`${prefix}: ${message}`, ...args);
  };
}
function createWarnLogger(prefix: string) {
  if (disabledPrefixes.has(prefix)) {
    return () => {};
  }
  return (message: string, ...args: any[]) => {
    log.warn(`${prefix}: ${message}`, ...args);
  };
}

function createErrorLogger(prefix: string) {
  if (disabledPrefixes.has(prefix)) {
    return () => {};
  }
  return (message: string, ...args: any[]) => {
    log.error(`${prefix}: ${message}`, ...args);
  };
}

function createVerboseLogger(prefix: string) {
  if (disabledPrefixes.has(prefix)) {
    return () => {};
  }
  return (message: string, ...args: any[]) => {
    log.verbose(`${prefix}: ${message}`, ...args);
  };
}

function createDebugLogger(prefix: string) {
  if (disabledPrefixes.has(prefix)) {
    return () => {};
  }
  return (message: string, ...args: any[]) => {
    log.debug(`${prefix}: ${message}`, ...args);
  };
}

function createSillyLogger(prefix: string) {
  if (disabledPrefixes.has(prefix)) {
    return () => {};
  }
  return (message: string, ...args: any[]) => {
    log.silly(`${prefix}: ${message}`, ...args);
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
