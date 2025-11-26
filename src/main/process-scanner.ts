/**
 * ProcessScanner - Native process scanning using pidtree/pidusage
 *
 * Replaces shell-based scanning (ps aux, wmic) with native Node.js
 * libraries for 10-100x faster, more reliable process discovery.
 */

import { appendFile } from 'node:fs/promises';
import { app, Notification, shell } from 'electron';
import pidtree from 'pidtree';
import pidusage from 'pidusage';
import { processLog as log, processLogPath } from './logs';

export interface ProcessInfo {
  pid: number;
  name: string;
  command: string;
  cpu?: number;
  memory?: number;
  elapsed?: number;
}

export interface ProcessScanResult {
  timestamp: number;
  totalCount: number;
  processes: ProcessInfo[];
  threshold: number;
  exceededThreshold: boolean;
  orphans: number[];
  scanDurationMs: number;
}

export interface ProcessMetadata {
  pid: number;
  scriptPath: string;
  startTime: number;
}

const PROCESS_COUNT_THRESHOLD = Number.parseInt(process.env.KIT_PROCESS_THRESHOLD || '20', 10);

export class ProcessScanner {
  private lastNotificationTime = 0;
  private readonly NOTIFICATION_RATE_LIMIT = 60 * 60 * 1000; // 1 hour in milliseconds

  /**
   * Internal registry of known processes (processes we spawned)
   */
  private knownProcesses = new Map<number, ProcessMetadata>();

  /**
   * Cache scan results briefly to avoid load spikes
   */
  private scanCache: { result: ProcessInfo[]; timestamp: number } | null = null;
  private readonly CACHE_TTL = 2000; // 2 seconds

  /**
   * Register a process we spawned for tracking
   */
  register(pid: number, metadata: Omit<ProcessMetadata, 'pid'>): void {
    this.knownProcesses.set(pid, { pid, ...metadata });
    log.verbose(`ProcessScanner: Registered process ${pid}`);
  }

  /**
   * Unregister a process (when it exits)
   */
  unregister(pid: number): void {
    if (this.knownProcesses.delete(pid)) {
      log.verbose(`ProcessScanner: Unregistered process ${pid}`);
    }
  }

  /**
   * Get all registered processes
   */
  getRegistered(): ProcessMetadata[] {
    return Array.from(this.knownProcesses.values());
  }

  /**
   * Check if a PID is alive using signal 0 (fastest method)
   */
  isAlive(pid: number): boolean {
    try {
      process.kill(pid, 0);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get child processes of the current process (or a specific parent)
   * Uses pidtree for fast, native process tree traversal
   */
  async getChildProcesses(parentPid: number = process.pid): Promise<number[]> {
    try {
      return await pidtree(parentPid);
    } catch (error) {
      // pidtree throws if no children found
      if ((error as Error).message?.includes('No matching pid found')) {
        return [];
      }
      log.error('ProcessScanner: Failed to get child processes:', error);
      return [];
    }
  }

  /**
   * Get detailed metrics for specific PIDs using pidusage
   */
  async getMetrics(pids: number[]): Promise<Map<number, { cpu: number; memory: number; elapsed: number }>> {
    const result = new Map<number, { cpu: number; memory: number; elapsed: number }>();

    if (pids.length === 0) {
      return result;
    }

    try {
      const stats = await pidusage(pids);
      for (const [pidStr, stat] of Object.entries(stats)) {
        const pid = Number(pidStr);
        if (stat && typeof stat === 'object' && 'cpu' in stat) {
          result.set(pid, {
            cpu: stat.cpu,
            memory: stat.memory,
            elapsed: stat.elapsed,
          });
        }
      }
    } catch (error) {
      log.error('ProcessScanner: Failed to get metrics:', error);
    }

    return result;
  }

  /**
   * Find orphaned processes (children not in our registry)
   */
  async findOrphans(): Promise<number[]> {
    const children = await this.getChildProcesses();
    return children.filter((pid) => !this.knownProcesses.has(pid));
  }

  /**
   * Scan for Script Kit processes using native methods
   * Much faster and more reliable than shell commands
   */
  async scanProcesses(): Promise<ProcessInfo[]> {
    // Check cache first
    if (this.scanCache && Date.now() - this.scanCache.timestamp < this.CACHE_TTL) {
      return this.scanCache.result;
    }

    const processes: ProcessInfo[] = [];

    try {
      // Get all child processes of this app
      const childPids = await this.getChildProcesses();

      // Add registered processes that are still alive
      for (const [pid, metadata] of this.knownProcesses) {
        if (this.isAlive(pid)) {
          processes.push({
            pid,
            name: app.isPackaged ? 'Script Kit' : 'Electron',
            command: metadata.scriptPath || 'idle',
          });
        } else {
          // Clean up dead process from registry
          this.knownProcesses.delete(pid);
        }
      }

      // Add any child processes not in registry (orphans)
      for (const pid of childPids) {
        if (!this.knownProcesses.has(pid) && !processes.find((p) => p.pid === pid)) {
          processes.push({
            pid,
            name: app.isPackaged ? 'Script Kit' : 'Electron',
            command: 'unknown (orphan)',
          });
        }
      }

      // Get metrics for all processes (optional, for detailed info)
      const allPids = processes.map((p) => p.pid);
      if (allPids.length > 0) {
        const metrics = await this.getMetrics(allPids);
        for (const proc of processes) {
          const metric = metrics.get(proc.pid);
          if (metric) {
            proc.cpu = metric.cpu;
            proc.memory = metric.memory;
            proc.elapsed = metric.elapsed;
          }
        }
      }
    } catch (error) {
      log.error('ProcessScanner: Scan failed:', error);
    }

    // Cache the result
    this.scanCache = { result: processes, timestamp: Date.now() };

    return processes;
  }

  async performScan(): Promise<ProcessScanResult> {
    const startTime = performance.now();
    const processes = await this.scanProcesses();
    const orphans = await this.findOrphans();
    const scanDurationMs = performance.now() - startTime;

    const result: ProcessScanResult = {
      timestamp: Date.now(),
      totalCount: processes.length,
      processes,
      threshold: PROCESS_COUNT_THRESHOLD,
      exceededThreshold: processes.length > PROCESS_COUNT_THRESHOLD,
      orphans,
      scanDurationMs,
    };

    await this.logResult(result);

    if (result.exceededThreshold) {
      await this.sendNotification(result);
    }

    return result;
  }

  private async logResult(result: ProcessScanResult) {
    const orphanInfo = result.orphans.length > 0 ? ` Orphans: ${result.orphans.length}` : '';
    const logEntry = `${new Date(result.timestamp).toISOString()} - Process Count: ${result.totalCount} (Threshold: ${result.threshold}) Scan: ${result.scanDurationMs.toFixed(1)}ms${orphanInfo}${result.exceededThreshold ? ' [EXCEEDED]' : ''}\n`;

    try {
      await appendFile(processLogPath, logEntry);

      // Also log to main electron log
      if (result.exceededThreshold) {
        log.warn(`Process count exceeded threshold: ${result.totalCount} > ${result.threshold}`);
      } else {
        log.info(`Process count: ${result.totalCount} (scanned in ${result.scanDurationMs.toFixed(1)}ms)`);
      }

      if (result.orphans.length > 0) {
        log.warn(`Found ${result.orphans.length} orphan process(es): ${result.orphans.join(', ')}`);
      }
    } catch (error) {
      log.error('Failed to write to process log:', error);
    }
  }

  private async sendNotification(result: ProcessScanResult) {
    const now = Date.now();

    // Rate limit notifications
    if (now - this.lastNotificationTime < this.NOTIFICATION_RATE_LIMIT) {
      log.info('Skipping notification due to rate limit');
      return;
    }

    this.lastNotificationTime = now;

    const notification = new Notification({
      title: 'Script Kit Process Warning',
      body: `High process count detected: ${result.totalCount} processes running.\nPlease check logs for details.`,
      urgency: 'critical',
      timeoutType: 'never',
    });

    notification.on('click', () => {
      // Open log file
      shell.openPath(processLogPath);
    });

    notification.show();
  }

  /**
   * Clear the scan cache (useful after spawning/killing processes)
   */
  clearCache(): void {
    this.scanCache = null;
  }

  /**
   * Get debug info about the scanner state
   */
  getDebugInfo(): Record<string, unknown> {
    return {
      registeredCount: this.knownProcesses.size,
      registered: Array.from(this.knownProcesses.values()),
      cacheAge: this.scanCache ? Date.now() - this.scanCache.timestamp : null,
      cachedProcessCount: this.scanCache?.result.length ?? null,
      threshold: PROCESS_COUNT_THRESHOLD,
      lastNotificationTime: this.lastNotificationTime,
    };
  }
}

export const processScanner = new ProcessScanner();
