import log from 'electron-log/renderer';
import { createLoggerFactory, Logger } from '../../shared/logger';

log.transports.console.level = false;
log.transports.ipc.level = 'info';

export const createLogger = createLoggerFactory(log);

export { Logger };
