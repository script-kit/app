/**
 * Consolidated Logger Entry Point
 *
 * This module provides the main logging infrastructure for Script Kit.
 * It consolidates 35 individual category loggers into 8 domain-based loggers
 * while maintaining backward compatibility with existing code.
 *
 * Domains:
 * - core: main, kit, system, health
 * - window: window, prompt, widget, theme
 * - process: process, script, background, worker
 * - input: keyboard, shortcuts, io, keymap, snippet, scriptlet
 * - communication: ipc, messages, server, mcp
 * - scheduling: schedule, tick, watcher, metadataWatcher, chokidar
 * - terminal: term, console
 * - diagnostic: debug, error, search, compare, update, processWindowCoordinator
 */

export {
  ElectronLogger,
  createElectronLogger,
  createLegacyLogger,
  createDomainLoggers,
  DOMAIN_CONFIG,
  getDomainForCategory,
  type ElectronLoggerOptions,
  type LegacyLogger,
} from './electron-adapter';

// Domain logger exports
export {
  initializeDomainLoggers,
  getDomainLogger,
  getAllDomainLoggers,
  setAllDomainLogLevels,
  setDomainLogLevel,
  getCoreLogger,
  getWindowLogger,
  getProcessLogger,
  getInputLogger,
  getCommunicationLogger,
  getSchedulingLogger,
  getTerminalLogger,
  getDiagnosticLogger,
  getLoggerForCategory,
  CATEGORY_TO_DOMAIN_GETTER,
} from './domain-loggers';

// Re-export types from SDK
export type {
  Logger,
  LogLevel,
  LogContext,
  LogEntry,
  LogTransport,
  LoggerOptions,
  TimerEndFn,
} from '@johnlindquist/kit/core/logger/types';

export {
  LOG_LEVEL_PRIORITY,
} from '@johnlindquist/kit/core/logger/types';

export {
  withCorrelation,
  withCorrelationAsync,
  getCorrelationId,
  getParentId,
  correlationMiddleware,
} from '@johnlindquist/kit/core/logger/correlation';

export {
  createRedactor,
  DEFAULT_REDACTION_PATHS,
} from '@johnlindquist/kit/core/logger/redaction';

export {
  JSONFormatter,
  PrettyFormatter,
  FileFormatter,
} from '@johnlindquist/kit/core/logger/formatters';
