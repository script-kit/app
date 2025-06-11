import schedule from 'node-schedule';
import { processLog as log } from './logs';
import { processScanner } from './process-scanner';
import { kitState } from './state';

export class ProcessMonitor {
  private job: schedule.Job | null = null;
  private isMonitoring = false;
  private lastScanTime = 0;
  private readonly SCAN_INTERVAL = Number.parseInt(process.env.KIT_PROCESS_SCAN_INTERVAL || '5', 10) * 60 * 1000; // Convert minutes to milliseconds

  async start() {
    if (this.isMonitoring) {
      log.info('Process monitor already running');
      return;
    }

    // Check if monitoring is enabled
    if (process.env.KIT_PROCESS_MONITOR_ENABLED === 'false') {
      log.info('Process monitoring is disabled via environment variable');
      return;
    }

    // Perform initial scan
    await this.performScan();

    // Schedule recurring scans every 5 minutes
    const cronExpression = `*/${process.env.KIT_PROCESS_SCAN_INTERVAL || '5'} * * * *`;
    this.job = schedule.scheduleJob(cronExpression, async () => {
      await this.performScan();
    });

    this.isMonitoring = true;
    kitState.processMonitorEnabled = true;
    log.info(`Process monitor started with ${this.SCAN_INTERVAL / 1000 / 60} minute interval`);
  }

  stop() {
    if (this.job) {
      this.job.cancel();
      this.job = null;
    }
    this.isMonitoring = false;
    kitState.processMonitorEnabled = false;
    log.info('Process monitor stopped');
  }

  private async performScan() {
    try {
      // Skip if system is sleeping or recently woke up
      if (kitState.suspended) {
        log.info('System is suspended, skipping process scan');
        return;
      }

      // Check if enough time has passed since last scan (handle wake scenarios)
      const now = Date.now();
      if (now - this.lastScanTime < this.SCAN_INTERVAL - 10000) {
        // 10 second buffer
        log.info('Skipping scan, not enough time elapsed');
        return;
      }

      this.lastScanTime = now;
      const result = await processScanner.performScan();

      // Update health monitor with process count
      if (global.healthMonitor) {
        global.healthMonitor.customMetrics = global.healthMonitor.customMetrics || {};
        global.healthMonitor.customMetrics.processCount = result.totalCount;
      }
    } catch (error) {
      log.error('Process scan failed:', error);
    }
  }

  handleSystemResume() {
    // After system resume, wait 30 seconds then perform scan
    log.info('System resumed, scheduling process scan in 30 seconds');
    setTimeout(async () => {
      if (this.isMonitoring) {
        await this.performScan();
      }
    }, 30000);
  }

  handleSystemSuspend() {
    // Mark the suspension time
    log.info('System suspending, process monitor pausing');
  }

  isRunning() {
    return this.isMonitoring;
  }
}

export const processMonitor = new ProcessMonitor();
