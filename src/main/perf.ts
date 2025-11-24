/**
 * Performance logging utility for tracking operation durations.
 *
 * Writes to a dedicated perf.log file for easy AI analysis.
 * Enable with KIT_PERF_LOG=true environment variable.
 *
 * Usage:
 *   import { perf } from './perf';
 *
 *   // Simple timing
 *   const end = perf.start('search', { choiceCount: 500 });
 *   // ... do work ...
 *   end(); // logs if over threshold
 *
 *   // Or with async/measure pattern
 *   const result = await perf.measure('search', async () => {
 *     return await doSearch();
 *   }, { choiceCount: 500 });
 */

import { performance } from 'node:perf_hooks';
import * as path from 'node:path';
import log, { type FileTransport } from 'electron-log';
import { app } from 'electron';
import { kitState } from './state';

// Threshold in ms - only log operations taking longer than this
const DEFAULT_THRESHOLD_MS = 5;

// Create dedicated perf logger
const perfLogInstance = log.create({ logId: 'perf' });
const perfLogPath = path.resolve(app.getPath('logs'), 'perf.log');
const fileTransport = perfLogInstance.transports.file as FileTransport;
fileTransport.resolvePathFn = () => perfLogPath;
fileTransport.format = '[{y}-{m}-{d} {h}:{i}:{s}.{ms}] {text}';
perfLogInstance.transports.console.level = false;
perfLogInstance.transports.ipc.level = false;
perfLogInstance.transports.file.level = 'info';

// Track in-flight operations for nested timing
const activeOperations = new Map<string, { startTime: number; context?: Record<string, unknown> }>();

// Operation counter for unique IDs when same operation runs concurrently
let opCounter = 0;

/**
 * Check if perf logging is enabled
 */
function isEnabled(): boolean {
  return (kitState?.kenvEnv as Record<string, string>)?.KIT_PERF_LOG === 'true' ||
         process.env.KIT_PERF_LOG === 'true';
}

/**
 * Format context object for logging
 */
function formatContext(context?: Record<string, unknown>): string {
  if (!context || Object.keys(context).length === 0) return '';

  const parts: string[] = [];
  for (const [key, value] of Object.entries(context)) {
    if (typeof value === 'number') {
      parts.push(`${key}=${value}`);
    } else if (typeof value === 'string') {
      parts.push(`${key}="${value.slice(0, 50)}${value.length > 50 ? '...' : ''}"`);
    } else if (typeof value === 'boolean') {
      parts.push(`${key}=${value}`);
    }
  }
  return parts.length > 0 ? ` | ${parts.join(', ')}` : '';
}

/**
 * Start timing an operation. Returns a function to call when done.
 *
 * @param name - Operation name (e.g., 'search', 'sendToPrompt')
 * @param context - Optional context data to include in log
 * @param thresholdMs - Only log if duration exceeds this (default: 5ms)
 * @returns Function to call when operation completes
 */
function start(
  name: string,
  context?: Record<string, unknown>,
  thresholdMs: number = DEFAULT_THRESHOLD_MS
): () => number {
  if (!isEnabled()) {
    return () => 0;
  }

  const startTime = performance.now();
  const opId = `${name}-${++opCounter}`;
  activeOperations.set(opId, { startTime, context });

  return () => {
    const endTime = performance.now();
    const duration = endTime - startTime;
    activeOperations.delete(opId);

    if (duration >= thresholdMs) {
      const contextStr = formatContext(context);
      perfLogInstance.info(`[PERF] ${name}: ${duration.toFixed(2)}ms${contextStr}`);
    }

    return duration;
  };
}

/**
 * Measure an async operation
 *
 * @param name - Operation name
 * @param fn - Async function to measure
 * @param context - Optional context data
 * @param thresholdMs - Only log if duration exceeds this
 * @returns Result of the function
 */
async function measure<T>(
  name: string,
  fn: () => Promise<T>,
  context?: Record<string, unknown>,
  thresholdMs: number = DEFAULT_THRESHOLD_MS
): Promise<T> {
  const end = start(name, context, thresholdMs);
  try {
    return await fn();
  } finally {
    end();
  }
}

/**
 * Measure a sync operation
 *
 * @param name - Operation name
 * @param fn - Function to measure
 * @param context - Optional context data
 * @param thresholdMs - Only log if duration exceeds this
 * @returns Result of the function
 */
function measureSync<T>(
  name: string,
  fn: () => T,
  context?: Record<string, unknown>,
  thresholdMs: number = DEFAULT_THRESHOLD_MS
): T {
  const end = start(name, context, thresholdMs);
  try {
    return fn();
  } finally {
    end();
  }
}

/**
 * Log a one-off performance metric (when you already have the duration)
 */
function logMetric(
  name: string,
  durationMs: number,
  context?: Record<string, unknown>,
  thresholdMs: number = DEFAULT_THRESHOLD_MS
): void {
  if (!isEnabled()) return;
  if (durationMs < thresholdMs) return;

  const contextStr = formatContext(context);
  perfLogInstance.info(`[PERF] ${name}: ${durationMs.toFixed(2)}ms${contextStr}`);
}

/**
 * Log a summary of multiple operations (useful for batch reporting)
 */
function logSummary(
  name: string,
  stats: { count: number; totalMs: number; maxMs: number; minMs: number },
  context?: Record<string, unknown>
): void {
  if (!isEnabled()) return;

  const avgMs = stats.count > 0 ? stats.totalMs / stats.count : 0;
  const contextStr = formatContext(context);
  perfLogInstance.info(
    `[PERF SUMMARY] ${name}: count=${stats.count}, total=${stats.totalMs.toFixed(2)}ms, ` +
    `avg=${avgMs.toFixed(2)}ms, min=${stats.minMs.toFixed(2)}ms, max=${stats.maxMs.toFixed(2)}ms${contextStr}`
  );
}

export const perf = {
  start,
  measure,
  measureSync,
  logMetric,
  logSummary,
  isEnabled,
};

export { perfLogPath };
