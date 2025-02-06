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
    try {
      // Use environment override if present, otherwise default to two minutes.
      this.interval = (Number(kitState.kenvEnv?.KIT_HEALTH_CHECK_INTERVAL) || intervalInSeconds) * 1000;
      this.startMonitoring();
    } catch (error) {
      healthLog.error('Error in HealthMonitor constructor', error);
    }
  }

  // Conversion helpers with basic type-checking.
  private bytesToMB(bytes: number): number {
    return typeof bytes === 'number' ? Number((bytes / (1024 * 1024)).toFixed(2)) : 0;
  }

  private kbToMB(kb: number): number {
    return typeof kb === 'number' ? Number((kb / 1024).toFixed(2)) : 0;
  }

  private microToMs(micro: number): number {
    return typeof micro === 'number' ? Number((micro / 1000).toFixed(2)) : 0;
  }

  // Wrapper functions with error catching and defaults.
  private getMemoryUsage() {
    try {
      return process.memoryUsage() || {};
    } catch (error) {
      healthLog.error('Error getting memory usage', error);
      return {};
    }
  }

  private getCPUUsage() {
    try {
      return process.cpuUsage() || {};
    } catch (error) {
      healthLog.error('Error getting CPU usage', error);
      return {};
    }
  }

  private getSystemMemoryInfo() {
    try {
      return process.getSystemMemoryInfo() || {};
    } catch (error) {
      healthLog.error('Error getting system memory info', error);
      return {};
    }
  }

  private async getProcessMemoryInfo() {
    try {
      return (await process.getProcessMemoryInfo()) || {};
    } catch (error) {
      healthLog.error('Error getting process memory info', error);
      return {};
    }
  }

  private async getGPUInfo() {
    try {
      const info = await app.getGPUInfo('complete');
      healthLog.info('GPU Info', info);
      return info;
    } catch (error) {
      healthLog.error('Error getting GPU info', error);
      return {};
    }
  }

  private async getAppMetrics() {
    try {
      return (await app.getAppMetrics()) || [];
    } catch (error) {
      healthLog.error('Error getting app metrics', error);
      return [];
    }
  }

  /**
   * Converts raw data values to numbers in MB or ms.
   */
  private formatHealthData(rawData: any): any {
    try {
      return {
        mainProcessMemory: rawData.mainProcessMemory ? this.kbToMB(rawData.mainProcessMemory) : 0,
        mainProcessCpu: rawData.mainProcessCpu ? this.microToMs(rawData.mainProcessCpu) : 0,
        memoryUsage: {
          rss: this.bytesToMB(rawData.memoryUsage?.rss || 0),
          heapTotal: this.bytesToMB(rawData.memoryUsage?.heapTotal || 0),
          heapUsed: this.bytesToMB(rawData.memoryUsage?.heapUsed || 0),
          external: this.bytesToMB(rawData.memoryUsage?.external || 0),
          arrayBuffers: this.bytesToMB(rawData.memoryUsage?.arrayBuffers || 0),
        },
        cpuUsage: {
          user: this.microToMs(rawData.cpuUsage?.user || 0),
          system: this.microToMs(rawData.cpuUsage?.system || 0),
        },
        systemMemoryInfo: {
          total: this.kbToMB(rawData.systemMemoryInfo?.total || 0),
          free: this.kbToMB(rawData.systemMemoryInfo?.free || 0),
        },
        processMemoryInfo: {
          private: this.kbToMB(rawData.processMemoryInfo?.private || 0),
          shared: this.kbToMB(rawData.processMemoryInfo?.shared || 0),
        },
        windows: Array.isArray(rawData.windows)
          ? rawData.windows.map((w: any) => ({
              id: w?.id ?? 0,
              title: w?.getTitle?.() ?? '',
              processId: w?.webContents?.getOSProcessId?.() ?? 0,
              memory: (() => {
                const metricsForWindow = rawData.windows.find(
                  (m: any) => m?.processId === w?.webContents?.getOSProcessId?.(),
                );
                return metricsForWindow
                  ? {
                      workingSetSize: this.kbToMB(metricsForWindow?.memory?.workingSetSize || 0),
                      peakWorkingSetSize: this.kbToMB(metricsForWindow?.memory?.peakWorkingSetSize || 0),
                    }
                  : { workingSetSize: 0, peakWorkingSetSize: 0 };
              })(),
              gpu: 'N/A',
            }))
          : [],
      };
    } catch (error) {
      healthLog.error('Error formatting health data', error);
      return {};
    }
  }

  /**
   * Recursively computes the difference between new and old data.
   */
  private computeDiff(newData: any, oldData: any): any {
    try {
      if (typeof newData === 'number' && typeof oldData === 'number') {
        return Number((newData - oldData).toFixed(2));
      }
      if (Array.isArray(newData) && Array.isArray(oldData)) {
        return newData.map((item, index) => this.computeDiff(item, oldData[index] || {}));
      }
      if (typeof newData === 'object' && newData !== null && typeof oldData === 'object' && oldData !== null) {
        const diff: any = {};
        for (const key in newData) {
          if (
            Object.prototype.hasOwnProperty.call(newData, key) &&
            Object.prototype.hasOwnProperty.call(oldData, key)
          ) {
            diff[key] = this.computeDiff(newData[key], oldData[key]);
          }
        }
        return diff;
      }
      return undefined;
    } catch (error) {
      healthLog.error('Error computing diff', error);
      return undefined;
    }
  }

  /**
   * Recursively updates and returns the maximum value seen for each metric.
   */
  private updateMax(newData: any, currentMax: any): any {
    try {
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
          if (Object.prototype.hasOwnProperty.call(newData, key)) {
            result[key] = this.updateMax(newData[key], currentMax ? currentMax[key] : undefined);
          }
        }
        return result;
      }
      return newData;
    } catch (error) {
      healthLog.error('Error updating max values', error);
      return newData;
    }
  }

  /**
   * Recursively appends units to numeric values.
   * For diff values, if a memory metric is less than 1 MB (and not zero),
   * the value is converted to KB so that small differences become visible.
   */
  private appendUnits(obj: any, isDiff: boolean = false): any {
    try {
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
            // For diff values, show in KB if less than 1 MB (but not 0).
            if (isDiff && Math.abs(value) < 1 && value !== 0) {
              return (value * 1024).toFixed(2) + ' KB';
            }
            return value.toFixed(2) + ' MB';
          }
          if (key === 'user' || key === 'system' || key === 'mainProcessCpu') {
            return value.toFixed(2) + ' ms';
          }
          return value;
        }
        if (Array.isArray(value)) {
          return value.map((item) => helper(key, item));
        }
        if (value !== null && typeof value === 'object') {
          const result: any = {};
          for (const k in value) {
            if (Object.prototype.hasOwnProperty.call(value, k)) {
              result[k] = helper(k, value[k]);
            }
          }
          return result;
        }
        return value;
      };

      return helper('', obj);
    } catch (error) {
      healthLog.error('Error appending units', error);
      return obj;
    }
  }

  /**
   * Gathers metrics, formats them, computes diffs, updates max values, and logs the output.
   */
  private async logHealth(): Promise<void> {
    try {
      const memoryUsage = this.getMemoryUsage();
      const cpuUsage = this.getCPUUsage();
      const systemMemoryInfo = this.getSystemMemoryInfo();
      const processMemoryInfo = await this.getProcessMemoryInfo();
      const appMetrics = await this.getAppMetrics();

      // Identify the main process metrics.
      const mainProcess = appMetrics.find((m: any) => m?.type === 'browser');

      // Retrieve window metrics.
      const windows = BrowserWindow.getAllWindows().map((w) => {
        const processId = w?.webContents?.getOSProcessId?.();
        const metricsForWindow = appMetrics.find((m: any) => m?.pid === processId);
        return {
          id: w?.id ?? 0,
          title: w?.getTitle?.() ?? '',
          processId,
          memory: metricsForWindow
            ? {
                workingSetSize: this.kbToMB(metricsForWindow?.memory?.workingSetSize || 0),
                peakWorkingSetSize: this.kbToMB(metricsForWindow?.memory?.peakWorkingSetSize || 0),
              }
            : { workingSetSize: 0, peakWorkingSetSize: 0 },
          gpu: 'N/A',
        };
      });

      // Build raw data object.
      const rawData = {
        mainProcessMemory: mainProcess?.memory ?? 0,
        mainProcessCpu: mainProcess?.cpu ?? 0,
        windows,
        memoryUsage,
        cpuUsage,
        systemMemoryInfo,
        processMemoryInfo,
      };

      // Format the raw data.
      const formattedData = this.formatHealthData(rawData);

      // Compute diffs and update historical snapshots.
      if (!this.previousData) {
        this.previousData = formattedData;
      }
      const diff = this.computeDiff(formattedData, this.previousData);
      this.previousData = formattedData;

      if (this.maxData) {
        this.maxData = this.updateMax(formattedData, this.maxData);
      } else {
        this.maxData = formattedData;
      }

      // Append units.
      const finalData = this.appendUnits(formattedData, false);
      const finalDiff = this.appendUnits(diff, true);
      const finalMax = this.appendUnits(this.maxData, false);

      // Prepare and log output.
      const output = {
        timestamp: new Date().toISOString(),
        data: finalData,
        diff: finalDiff,
        max: finalMax,
      };

      healthLog.info(JSON.stringify(output, null, 2));
    } catch (error) {
      healthLog.error('Error in logHealth', error);
    }
  }

  public startMonitoring(): void {
    try {
      if (this.intervalId) {
        return; // Already monitoring.
      }
      healthLog.info(`Starting health monitoring with interval: ${this.interval / 1000}s`);
      this.intervalId = setInterval(() => {
        try {
          this.logHealth();
        } catch (error) {
          healthLog.error('Error in monitoring interval', error);
        }
      }, this.interval);
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
