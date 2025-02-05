// src/main/health-monitor.ts
import { app, BrowserWindow } from 'electron';
import { healthLog } from './logs';
import { kitState } from './state';

export class HealthMonitor {
  private intervalId: NodeJS.Timeout | null = null;
  private interval: number;
  private previousData: any = null; // Holds the previous snapshot (formatted)
  private maxData: any = null; // Holds the maximum values observed so far

  constructor(intervalInSeconds = 120) {
    // Default to every two minutes
    this.interval = intervalInSeconds * 1000; // Convert seconds to milliseconds
    if (kitState.kenvEnv?.KIT_HEALTH_CHECK_INTERVAL) {
      this.interval = Number(kitState.kenvEnv?.KIT_HEALTH_CHECK_INTERVAL) * 1000;
    }
    this.startMonitoring();
  }

  // Conversion helper functions
  private bytesToMB(bytes: number): number {
    return Number((bytes / (1024 * 1024)).toFixed(2));
  }

  private kbToMB(kb: number): number {
    return Number((kb / 1024).toFixed(2));
  }

  private microToMs(micro: number): number {
    return Number((micro / 1000).toFixed(2));
  }

  private getMemoryUsage() {
    return process.memoryUsage();
  }

  private getCPUUsage() {
    return process.cpuUsage();
  }

  private getSystemMemoryInfo() {
    return process.getSystemMemoryInfo();
  }

  private getProcessMemoryInfo() {
    return process.getProcessMemoryInfo();
  }

  private async getGPUInfo() {
    const info = await app.getGPUInfo('complete');
    healthLog.info('GPU Info', info);
    return info;
  }

  private async getAppMetrics() {
    return app.getAppMetrics();
  }

  /**
   * Converts raw data values to numbers in MB or ms.
   */
  private formatHealthData(rawData: any): any {
    return {
      mainProcessMemory: rawData.mainProcessMemory ? this.kbToMB(rawData.mainProcessMemory) : undefined,
      mainProcessCpu: rawData.mainProcessCpu ? this.microToMs(rawData.mainProcessCpu) : undefined,
      memoryUsage: {
        rss: this.bytesToMB(rawData.memoryUsage.rss),
        heapTotal: this.bytesToMB(rawData.memoryUsage.heapTotal),
        heapUsed: this.bytesToMB(rawData.memoryUsage.heapUsed),
        external: this.bytesToMB(rawData.memoryUsage.external),
        arrayBuffers: this.bytesToMB(rawData.memoryUsage.arrayBuffers),
      },
      cpuUsage: {
        user: this.microToMs(rawData.cpuUsage.user),
        system: this.microToMs(rawData.cpuUsage.system),
      },
      systemMemoryInfo: {
        total: this.kbToMB(rawData.systemMemoryInfo.total),
        free: this.kbToMB(rawData.systemMemoryInfo.free),
      },
      processMemoryInfo: {
        private: this.kbToMB(rawData.processMemoryInfo.private),
        shared: this.kbToMB(rawData.processMemoryInfo.shared),
      },
      windows: rawData.windows.map((w: any) => ({
        id: w.id,
        title: w.getTitle(),
        processId: w.webContents.getOSProcessId(),
        memory: (() => {
          const metricsForWindow = rawData.windows.find((m: any) => m.processId === w.webContents.getOSProcessId());
          return metricsForWindow
            ? {
                workingSetSize: this.kbToMB(metricsForWindow.memory.workingSetSize),
                peakWorkingSetSize: this.kbToMB(metricsForWindow.memory.peakWorkingSetSize),
              }
            : { workingSetSize: 0, peakWorkingSetSize: 0 };
        })(),
        gpu: 'N/A',
      })),
    };
  }

  /**
   * Recursively computes the difference between new and old data.
   * For numbers, subtracts the previous value from the new value.
   */
  private computeDiff(newData: any, oldData: any): any {
    if (typeof newData === 'number' && typeof oldData === 'number') {
      return Number((newData - oldData).toFixed(2));
    }
    if (Array.isArray(newData) && Array.isArray(oldData)) {
      return newData.map((item, index) => this.computeDiff(item, oldData[index] || {}));
    }
    if (typeof newData === 'object' && newData !== null && typeof oldData === 'object' && oldData !== null) {
      const diff: any = {};
      for (const key in newData) {
        if (newData.hasOwnProperty(key) && oldData.hasOwnProperty(key)) {
          diff[key] = this.computeDiff(newData[key], oldData[key]);
        }
      }
      return diff;
    }
    return undefined;
  }

  /**
   * Recursively updates and returns the maximum value seen for each metric.
   */
  private updateMax(newData: any, currentMax: any): any {
    if (typeof newData === 'number') {
      if (typeof currentMax === 'number') {
        return Math.max(currentMax, newData);
      }
      return newData;
    }
    if (Array.isArray(newData)) {
      return newData.map((item, index) => this.updateMax(item, currentMax ? currentMax[index] : undefined));
    }
    if (typeof newData === 'object' && newData !== null) {
      const result: any = {};
      for (const key in newData) {
        if (newData.hasOwnProperty(key)) {
          result[key] = this.updateMax(newData[key], currentMax ? currentMax[key] : undefined);
        }
      }
      return result;
    }
    return newData;
  }

  /**
   * Recursively appends units to numeric values.
   * When isDiff is true, if a memory metric is less than 1 MB (and not zero),
   * the value is converted to KB so that small differences become visible.
   */
  private appendUnits(obj: any, isDiff: boolean = false): any {
    const memoryKeys = new Set([
      'rss',
      'heapTotal',
      'heapUsed',
      'external',
      'arrayBuffers',
      'total',
      'free',
      'private',
      'shared',
      'workingSetSize',
      'peakWorkingSetSize',
      'mainProcessMemory',
    ]);

    const helper = (key: string, value: any): any => {
      if (typeof value === 'number') {
        if (memoryKeys.has(key)) {
          // For diff values, if the difference is less than 1 MB, show in KB.
          if (isDiff && Math.abs(value) < 1 && value !== 0) {
            return (value * 1024).toFixed(2) + ' KB';
          } else {
            return value.toFixed(2) + ' MB';
          }
        } else if (key === 'user' || key === 'system' || key === 'mainProcessCpu') {
          return value.toFixed(2) + ' ms';
        }
        return value;
      } else if (Array.isArray(value)) {
        return value.map((item) => helper(key, item));
      } else if (value !== null && typeof value === 'object') {
        const result: any = {};
        for (const k in value) {
          if (value.hasOwnProperty(k)) {
            result[k] = helper(k, value[k]);
          }
        }
        return result;
      }
      return value;
    };

    return helper('', obj);
  }

  /**
   * Gathers metrics, formats them, computes diffs, updates max values, and logs the output.
   * For the diff part, the appendUnits function is called with isDiff=true so that
   * small differences (i.e. less than 1 MB) are shown in KB.
   */
  private async logHealth(): Promise<void> {
    const memoryUsage = this.getMemoryUsage();
    const cpuUsage = this.getCPUUsage();
    const systemMemoryInfo = this.getSystemMemoryInfo();
    const processMemoryInfo = await this.getProcessMemoryInfo();
    const appMetrics = await this.getAppMetrics();

    // Identify the main process metrics.
    const mainProcess = appMetrics.find((m: any) => m.type === 'browser');

    // Retrieve window metrics.
    const windows = BrowserWindow.getAllWindows().map((w) => {
      const processId = w.webContents.getOSProcessId();
      const metricsForWindow = appMetrics.find((m: any) => m.pid === processId);
      return {
        id: w.id,
        title: w.getTitle(),
        processId,
        memory: metricsForWindow
          ? {
              workingSetSize: this.kbToMB(metricsForWindow.memory.workingSetSize),
              peakWorkingSetSize: this.kbToMB(metricsForWindow.memory.peakWorkingSetSize),
            }
          : { workingSetSize: 0, peakWorkingSetSize: 0 },
        gpu: 'N/A',
      };
    });

    // Build raw data object.
    const rawData = {
      mainProcessMemory: mainProcess?.memory,
      mainProcessCpu: mainProcess?.cpu,
      windows,
      memoryUsage,
      cpuUsage,
      systemMemoryInfo,
      processMemoryInfo,
    };

    // Format the raw data.
    const formattedData = this.formatHealthData(rawData);

    // Initialize previous snapshot if needed.
    if (!this.previousData) {
      this.previousData = formattedData;
    }
    // Compute diff between current snapshot and previous snapshot.
    const diff = this.computeDiff(formattedData, this.previousData);
    // Update baseline.
    this.previousData = formattedData;

    // Update maximum values.
    if (!this.maxData) {
      this.maxData = formattedData;
    } else {
      this.maxData = this.updateMax(formattedData, this.maxData);
    }

    // Append units.
    const finalData = this.appendUnits(formattedData, false);
    const finalDiff = this.appendUnits(diff, true); // use isDiff=true for diff so small differences show in KB
    const finalMax = this.appendUnits(this.maxData, false);

    // Prepare output.
    const output = {
      timestamp: new Date().toISOString(),
      data: finalData,
      diff: finalDiff,
      max: finalMax,
    };

    healthLog.info(JSON.stringify(output, null, 2));
  }

  public startMonitoring(): void {
    if (this.intervalId) return; // Already monitoring
    healthLog.info(`Starting health monitoring with interval: ${this.interval / 1000}s`);
    this.intervalId = setInterval(() => this.logHealth(), this.interval);
  }

  public stopMonitoring(): void {
    healthLog.info(`Stopping health monitoring`);
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }
}
