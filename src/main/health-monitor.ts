// src/main/health-monitor.ts
import { app, BrowserWindow } from 'electron';
import { envNumber } from './env.utils';
import { healthLog } from './logs';
import { kitState } from './state';

// A generic type for recursively nested numeric metric values.
type UnitString = `${number} MB` | `${number} ms`;
type MetricsValue = number | UnitString | MetricsValue[] | { [key: string]: MetricsValue } | HealthReport | FullMetrics;

interface MemoryMetrics {
  residentMemory: number; // Formerly "rss"
  totalHeapMemory: number; // Formerly "heapTotal"
  usedHeapMemory: number; // Formerly "heapUsed"
  externalMemory: number; // Formerly "external"
  bufferMemory: number; // Formerly "arrayBuffers"
}

interface CpuMetrics {
  userTime: number; // in ms
  systemTime: number; // in ms
  totalCpuTime: number; // userTime + systemTime, in ms
}

interface AppMetrics {
  memory: MemoryMetrics;
  cpu: CpuMetrics;
}

interface WindowMemoryMetrics {
  currentWorkingMemory: number; // in MB (converted from workingSetSize)
  peakWorkingMemory: number; // in MB (converted from peakWorkingSetSize)
}

interface WindowMetrics {
  windowId: number;
  title: string;
  osProcessId: number;
  memory: WindowMemoryMetrics;
}

interface FullMetrics {
  app: AppMetrics;
  windows: WindowMetrics[];
  processCount?: number;
}

interface HealthReport {
  timestamp: string;
  current: FullMetrics;
  delta?: FullMetrics;
  history: {
    max: FullMetrics;
    min: FullMetrics;
    average: FullMetrics;
  };
}

// --- Helper Functions for Recursion over MetricsValue ---

// Update maximum recursively.
function updateMax(newData: MetricsValue, currentMax: MetricsValue): MetricsValue {
  if (typeof newData === 'number' && typeof currentMax === 'number') {
    return newData > currentMax ? newData : currentMax;
  }
  if (Array.isArray(newData) && Array.isArray(currentMax)) {
    return newData.map((item, index) => updateMax(item, currentMax[index] !== undefined ? currentMax[index] : item));
  }
  if (typeof newData === 'object' && newData !== null && typeof currentMax === 'object' && currentMax !== null) {
    const result: { [key: string]: MetricsValue } = {};
    for (const key in newData) {
      if (Object.hasOwn(newData, key)) {
        result[key] = updateMax(
          (newData as { [key: string]: MetricsValue })[key],
          (currentMax as { [key: string]: MetricsValue })[key],
        );
      }
    }
    return result;
  }
  return newData;
}

// Update minimum recursively.
function updateMin(newData: MetricsValue, currentMin: MetricsValue): MetricsValue {
  if (typeof newData === 'number' && typeof currentMin === 'number') {
    return newData < currentMin ? newData : currentMin;
  }
  if (Array.isArray(newData) && Array.isArray(currentMin)) {
    return newData.map((item, index) => updateMin(item, currentMin[index] !== undefined ? currentMin[index] : item));
  }
  if (typeof newData === 'object' && newData !== null && typeof currentMin === 'object' && currentMin !== null) {
    const result: { [key: string]: MetricsValue } = {};
    for (const key in newData) {
      if (Object.hasOwn(newData, key)) {
        result[key] = updateMin(
          (newData as { [key: string]: MetricsValue })[key],
          (currentMin as { [key: string]: MetricsValue })[key],
        );
      }
    }
    return result;
  }
  return newData;
}

// Update cumulative sum recursively.
function updateSum(newData: MetricsValue, currentSum: MetricsValue): MetricsValue {
  if (typeof newData === 'number') {
    return (typeof currentSum === 'number' ? currentSum : 0) + newData;
  }
  if (Array.isArray(newData) && Array.isArray(currentSum)) {
    return newData.map((item, index) => updateSum(item, currentSum[index] !== undefined ? currentSum[index] : 0));
  }
  if (typeof newData === 'object' && newData !== null && typeof currentSum === 'object' && currentSum !== null) {
    const result: { [key: string]: MetricsValue } = {};
    for (const key in newData) {
      if (Object.hasOwn(newData, key)) {
        result[key] = updateSum(
          (newData as { [key: string]: MetricsValue })[key],
          (currentSum as { [key: string]: MetricsValue })[key],
        );
      }
    }
    return result;
  }
  return newData;
}

// Compute average recursively.
function computeAverage(sumData: MetricsValue, count: number): MetricsValue {
  if (typeof sumData === 'number') {
    return Number((sumData / count).toFixed(2));
  }
  if (Array.isArray(sumData)) {
    return sumData.map((item) => computeAverage(item, count));
  }
  if (typeof sumData === 'object' && sumData !== null) {
    const result: { [key: string]: MetricsValue } = {};
    for (const key in sumData) {
      if (Object.hasOwn(sumData, key)) {
        result[key] = computeAverage((sumData as { [key: string]: MetricsValue })[key], count);
      }
    }
    return result;
  }
  return sumData;
}

// Compute delta between newData and oldData recursively.
function computeDelta(newData: MetricsValue, oldData: MetricsValue): MetricsValue {
  if (typeof newData === 'number' && typeof oldData === 'number') {
    return Number((newData - oldData).toFixed(2));
  }
  if (Array.isArray(newData) && Array.isArray(oldData)) {
    return newData.map((item, index) => computeDelta(item, oldData[index] !== undefined ? oldData[index] : 0));
  }
  if (typeof newData === 'object' && newData !== null && typeof oldData === 'object' && oldData !== null) {
    const result: { [key: string]: MetricsValue } = {};
    for (const key in newData) {
      if (Object.hasOwn(newData, key) && Object.hasOwn(oldData, key)) {
        result[key] = computeDelta(
          (newData as { [key: string]: MetricsValue })[key],
          (oldData as { [key: string]: MetricsValue })[key],
        );
      }
    }
    return result;
  }
  return 0;
}

// --- HealthMonitor Class ---
export class HealthMonitor {
  private intervalId: NodeJS.Timeout | null = null;
  private interval: number | undefined;
  private previousSnapshot: FullMetrics | null = null;
  private maxSnapshot: FullMetrics | null = null;
  private minSnapshot: FullMetrics | null = null;
  private sumSnapshot: FullMetrics | null = null;
  private snapshotCount = 0;
  public customMetrics: Record<string, any> = {};

  constructor(intervalInSeconds = 120) {
    try {
      // Allow override from environment; default to 120 seconds. Clamp to [10s, 3600s].
      const seconds = envNumber('KIT_HEALTH_CHECK_INTERVAL', intervalInSeconds, { min: 10, max: 3600 });
      this.interval = seconds * 1000;
      this.startMonitoring();
    } catch (error) {
      healthLog.error('HealthMonitor constructor error', error);
    }
  }

  // Conversion helpers.
  private bytesToMB(bytes: number): number {
    return Number((bytes / (1024 * 1024)).toFixed(2));
  }
  private kbToMB(kb: number): number {
    return Number((kb / 1024).toFixed(2));
  }
  private microToMs(micro: number): number {
    return Number((micro / 1000).toFixed(2));
  }

  /**
   * Gather raw app usage metrics (from process API) and raw metrics from Electron for windows.
   */
  private async getRawMetrics(): Promise<{
    rawApp: ReturnType<typeof process.memoryUsage> & ReturnType<typeof process.cpuUsage>;
    rawAppMetrics: any[];
  }> {
    try {
      const rawMemory = process.memoryUsage();
      const rawCpu = process.cpuUsage();
      // rawApp combines memory and cpu (for the main process).
      const rawApp = { ...rawMemory, ...rawCpu };
      // Retrieve Electron app metrics for all processes.
      const rawAppMetrics: unknown = await app.getAppMetrics();
      // For our purposes, assume rawAppMetrics is an array.
      return { rawApp, rawAppMetrics: Array.isArray(rawAppMetrics) ? rawAppMetrics : [] };
    } catch (error) {
      healthLog.error('Error getting raw metrics', error);
      return {
        rawApp: {
          rss: 0,
          heapTotal: 0,
          heapUsed: 0,
          external: 0,
          arrayBuffers: 0,
          user: 0,
          system: 0,
        },
        rawAppMetrics: [],
      };
    }
  }

  /**
   * Format the raw metrics into our FullMetrics structure.
   * For the "app" section, we use process.memoryUsage() and process.cpuUsage().
   * For the "windows" section, we match BrowserWindow instances with Electron metrics.
   */
  private async formatMetrics(): Promise<FullMetrics> {
    const { rawApp, rawAppMetrics } = await this.getRawMetrics();

    // Format main app memory metrics.
    const appMemory: MemoryMetrics = {
      residentMemory: this.bytesToMB(rawApp.rss || 0),
      totalHeapMemory: this.bytesToMB(rawApp.heapTotal || 0),
      usedHeapMemory: this.bytesToMB(rawApp.heapUsed || 0),
      externalMemory: this.bytesToMB(rawApp.external || 0),
      bufferMemory: this.bytesToMB(rawApp.arrayBuffers || 0),
    };

    // Format main app CPU metrics.
    const userTime = this.microToMs(rawApp.user || 0);
    const systemTime = this.microToMs(rawApp.system || 0);
    const cpu: CpuMetrics = {
      userTime,
      systemTime,
      totalCpuTime: Number((userTime + systemTime).toFixed(2)),
    };

    const appMetrics: AppMetrics = { memory: appMemory, cpu };

    // Process window metrics.
    const windows: WindowMetrics[] = BrowserWindow.getAllWindows().map((win) => {
      const osProcessId: number = win.webContents.getOSProcessId();
      // Find matching metrics in rawAppMetrics (if available).
      const matchingMetrics = (rawAppMetrics as any[]).find((m) => m.pid === osProcessId);
      let workingMemory = 0;
      let peakWorkingMemory = 0;
      if (matchingMetrics?.memory) {
        // Assume memory values in matchingMetrics.memory are in KB.
        workingMemory = this.kbToMB(matchingMetrics.memory.workingSetSize || 0);
        peakWorkingMemory = this.kbToMB(matchingMetrics.memory.peakWorkingSetSize || 0);
      }
      return {
        windowId: win.id,
        title: win.getTitle() || '',
        osProcessId,
        memory: {
          currentWorkingMemory: workingMemory,
          peakWorkingMemory: peakWorkingMemory,
        },
      };
    });

    return {
      app: appMetrics,
      windows,
      processCount: this.customMetrics.processCount,
    };
  }

  /**
   * Append units to numeric values for readability.
   * Memory values get " MB" and CPU values get " ms".
   */
  private appendUnits(data: MetricsValue): MetricsValue {
    if (typeof data === 'number') {
      // Without context we assume numbers below 1000 are CPU times (ms) and larger numbers are MB.
      // However, here our values are already scaled.
      return data;
    }
    if (Array.isArray(data)) {
      return data.map((item) => this.appendUnits(item));
    }
    if (typeof data === 'object' && data !== null) {
      const result: { [key: string]: MetricsValue } = {};
      for (const key in data) {
        if (Object.hasOwn(data, key)) {
          const value = (data as { [key: string]: MetricsValue })[key];
          if (typeof value === 'number') {
            // Append unit based on key.
            if (key.toLowerCase().includes('memory')) {
              result[key] = `${Number(value.toFixed(2))} MB` as UnitString;
            } else if (key.toLowerCase().includes('time')) {
              result[key] = `${Number(value.toFixed(2))} ms` as UnitString;
            } else {
              result[key] = value;
            }
          } else {
            result[key] = this.appendUnits(value);
          }
        }
      }
      return result;
    }
    return data;
  }

  /**
   * Log the health report.
   */
  private async logHealth(): Promise<void> {
    try {
      const currentMetrics: FullMetrics = await this.formatMetrics();

      // Compute delta if previous snapshot exists.
      const delta: FullMetrics | undefined = this.previousSnapshot
        ? (computeDelta(currentMetrics, this.previousSnapshot) as FullMetrics)
        : undefined;

      // Update historical snapshots.
      if (this.maxSnapshot) {
        this.maxSnapshot = updateMax(currentMetrics, this.maxSnapshot) as FullMetrics;
      } else {
        this.maxSnapshot = currentMetrics;
      }
      if (this.minSnapshot) {
        this.minSnapshot = updateMin(currentMetrics, this.minSnapshot) as FullMetrics;
      } else {
        this.minSnapshot = currentMetrics;
      }
      if (this.sumSnapshot) {
        this.sumSnapshot = updateSum(currentMetrics, this.sumSnapshot) as FullMetrics;
      } else {
        // Deep copy the first snapshot.
        this.sumSnapshot = JSON.parse(JSON.stringify(currentMetrics));
      }
      this.snapshotCount++;
      const average = this.sumSnapshot
        ? (computeAverage(this.sumSnapshot, this.snapshotCount) as FullMetrics)
        : currentMetrics;

      // Save current snapshot.
      this.previousSnapshot = currentMetrics;

      // Build the report.
      const report: HealthReport = {
        timestamp: new Date().toISOString(),
        current: currentMetrics,
        delta: delta as FullMetrics,
        history: {
          max: this.maxSnapshot,
          min: this.minSnapshot,
          average,
        },
      };

      // Append units for display.
      const finalReport = this.appendUnits(report);
      healthLog.info(JSON.stringify(finalReport, null, 2));
    } catch (error) {
      healthLog.error('Error in logHealth', error);
    }
  }

  public startMonitoring(): void {
    try {
      if (this.intervalId) {
        return; // Already monitoring.
      }
      healthLog.info(`Starting health monitoring (interval: ${this.interval ?? 120000}s)`);
      this.intervalId = setInterval(() => {
        this.logHealth().catch((err) => healthLog.error('Monitoring interval error', err));
      }, this.interval ?? 120000);
    } catch (error) {
      healthLog.error('Error starting monitoring', error);
    }
  }

  public stopMonitoring(): void {
    try {
      healthLog.info('Stopping health monitoring');
      if (this.intervalId) {
        clearInterval(this.intervalId);
        this.intervalId = null;
      }
    } catch (error) {
      healthLog.error('Error stopping monitoring', error);
    }
  }
}
