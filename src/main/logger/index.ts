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
  correlationMiddleware,
  getCorrelationId,
  getParentId,
  withCorrelation,
  withCorrelationAsync,
} from '@johnlindquist/kit/core/logger/correlation';
export {
  FileFormatter,
  JSONFormatter,
  PrettyFormatter,
} from '@johnlindquist/kit/core/logger/formatters';
export {
  createRedactor,
  DEFAULT_REDACTION_PATHS,
} from '@johnlindquist/kit/core/logger/redaction';
// Re-export types from SDK
export type {
  LogContext,
  LogEntry,
  Logger,
  LoggerOptions,
  LogLevel,
  LogTransport,
  TimerEndFn,
} from '@johnlindquist/kit/core/logger/types';
export { LOG_LEVEL_PRIORITY } from '@johnlindquist/kit/core/logger/types';
// Domain logger exports
export {
  CATEGORY_TO_DOMAIN_GETTER,
  getAllDomainLoggers,
  getCommunicationLogger,
  getCoreLogger,
  getDiagnosticLogger,
  getDomainLogger,
  getInputLogger,
  getLoggerForCategory,
  getProcessLogger,
  getSchedulingLogger,
  getTerminalLogger,
  getWindowLogger,
  initializeDomainLoggers,
  setAllDomainLogLevels,
  setDomainLogLevel,
} from './domain-loggers';
export {
  createDomainLoggers,
  createElectronLogger,
  createLegacyLogger,
  DOMAIN_CONFIG,
  ElectronLogger,
  type ElectronLoggerOptions,
  getDomainForCategory,
  type LegacyLogger,
} from './electron-adapter';
