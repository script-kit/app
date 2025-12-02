/**
 * Domain-Based Loggers
 *
 * Consolidates 35 individual category loggers into 8 domain-based loggers
 * for better organization, performance, and maintainability.
 *
 * Each domain groups related functionality:
 * - core: Core application functionality (main, kit, system, health)
 * - window: Window and UI management (window, prompt, widget, theme)
 * - process: Process and script execution (process, script, background, worker)
 * - input: User input handling (keyboard, shortcuts, io, keymap, snippet, scriptlet)
 * - communication: IPC and network (ipc, messages, server, mcp)
 * - scheduling: Tasks and file watching (schedule, tick, watcher, metadataWatcher, chokidar)
 * - terminal: Terminal output (term, console)
 * - diagnostic: Debugging and diagnostics (debug, error, search, compare, update, processWindowCoordinator)
 */

import { createElectronLogger, DOMAIN_CONFIG, type ElectronLogger, type LogLevel } from './electron-adapter';

/**
 * Domain logger instances
 */
let domainLoggers: Map<string, ElectronLogger> | null = null;

/**
 * Initialize domain loggers
 * Call this once during app startup
 */
export function initializeDomainLoggers(options?: {
  structured?: boolean;
  defaultLevel?: LogLevel;
}): Map<string, ElectronLogger> {
  if (domainLoggers) {
    return domainLoggers;
  }

  domainLoggers = new Map();

  for (const [domain, config] of Object.entries(DOMAIN_CONFIG)) {
    const logger = createElectronLogger({
      name: domain,
      level: options?.defaultLevel ?? config.level,
      structured: options?.structured,
    });
    domainLoggers.set(domain, logger);
  }

  return domainLoggers;
}

/**
 * Get a domain logger by name
 */
export function getDomainLogger(domain: string): ElectronLogger {
  if (!domainLoggers) {
    initializeDomainLoggers();
  }
  const logger = domainLoggers!.get(domain);
  if (!logger) {
    // Return core logger as fallback
    return domainLoggers!.get('core')!;
  }
  return logger;
}

/**
 * Get all domain loggers
 */
export function getAllDomainLoggers(): Map<string, ElectronLogger> {
  if (!domainLoggers) {
    initializeDomainLoggers();
  }
  return domainLoggers!;
}

/**
 * Set log level for all domain loggers
 */
export function setAllDomainLogLevels(level: LogLevel): void {
  if (!domainLoggers) {
    return;
  }
  for (const logger of domainLoggers.values()) {
    logger.setLevel(level);
  }
}

/**
 * Set log level for a specific domain
 */
export function setDomainLogLevel(domain: string, level: LogLevel): void {
  const logger = domainLoggers?.get(domain);
  if (logger) {
    logger.setLevel(level);
  }
}

// ============================================================================
// Domain Logger Exports
// ============================================================================

/**
 * Core domain logger
 * Categories: main, kit, system, health
 */
export function getCoreLogger(): ElectronLogger {
  return getDomainLogger('core');
}

/**
 * Window domain logger
 * Categories: window, prompt, widget, theme
 */
export function getWindowLogger(): ElectronLogger {
  return getDomainLogger('window');
}

/**
 * Process domain logger
 * Categories: process, script, background, worker
 */
export function getProcessLogger(): ElectronLogger {
  return getDomainLogger('process');
}

/**
 * Input domain logger
 * Categories: keyboard, shortcuts, io, keymap, snippet, scriptlet
 */
export function getInputLogger(): ElectronLogger {
  return getDomainLogger('input');
}

/**
 * Communication domain logger
 * Categories: ipc, messages, server, mcp
 */
export function getCommunicationLogger(): ElectronLogger {
  return getDomainLogger('communication');
}

/**
 * Scheduling domain logger
 * Categories: schedule, tick, watcher, metadataWatcher, chokidar
 */
export function getSchedulingLogger(): ElectronLogger {
  return getDomainLogger('scheduling');
}

/**
 * Terminal domain logger
 * Categories: term, console
 */
export function getTerminalLogger(): ElectronLogger {
  return getDomainLogger('terminal');
}

/**
 * Diagnostic domain logger
 * Categories: debug, error, search, compare, update, processWindowCoordinator
 */
export function getDiagnosticLogger(): ElectronLogger {
  return getDomainLogger('diagnostic');
}

// ============================================================================
// Category-to-Domain Mapping for Migration
// ============================================================================

/**
 * Map of old category names to their domain logger getter
 * Use this to help migrate from the old 35-logger system
 */
export const CATEGORY_TO_DOMAIN_GETTER: Record<string, () => ElectronLogger> = {
  // Core domain
  main: getCoreLogger,
  kit: getCoreLogger,
  system: getCoreLogger,
  health: getCoreLogger,

  // Window domain
  window: getWindowLogger,
  prompt: getWindowLogger,
  widget: getWindowLogger,
  theme: getWindowLogger,

  // Process domain
  process: getProcessLogger,
  script: getProcessLogger,
  background: getProcessLogger,
  worker: getProcessLogger,

  // Input domain
  keyboard: getInputLogger,
  shortcuts: getInputLogger,
  io: getInputLogger,
  keymap: getInputLogger,
  snippet: getInputLogger,
  scriptlet: getInputLogger,

  // Communication domain
  ipc: getCommunicationLogger,
  messages: getCommunicationLogger,
  server: getCommunicationLogger,
  mcp: getCommunicationLogger,

  // Scheduling domain
  schedule: getSchedulingLogger,
  tick: getSchedulingLogger,
  watcher: getSchedulingLogger,
  metadataWatcher: getSchedulingLogger,
  chokidar: getSchedulingLogger,

  // Terminal domain
  term: getTerminalLogger,
  console: getTerminalLogger,

  // Diagnostic domain
  debug: getDiagnosticLogger,
  error: getDiagnosticLogger,
  search: getDiagnosticLogger,
  compare: getDiagnosticLogger,
  update: getDiagnosticLogger,
  processWindowCoordinator: getDiagnosticLogger,
};

/**
 * Get a domain logger by old category name
 * This is a helper for migrating from the old logger system
 */
export function getLoggerForCategory(category: string): ElectronLogger {
  const getter = CATEGORY_TO_DOMAIN_GETTER[category];
  if (getter) {
    return getter();
  }
  // Default to core logger
  return getCoreLogger();
}
