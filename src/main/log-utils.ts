import log from 'electron-log';
import { createLoggerFactory, Logger } from '../shared/logger';

log.transports.console.level = false;
log.transports.ipc.level = false;
log.transports.file.level = 'info';

export const createLogger = createLoggerFactory(log);

export { Logger };
