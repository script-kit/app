import { execSync } from 'node:child_process';
import { appendFile } from 'node:fs/promises';
import { Notification, shell, app } from 'electron';
import { processLog as log, processLogPath } from './logs';

interface ProcessInfo {
  pid: number;
  name: string;
  command: string;
}

interface ProcessScanResult {
  timestamp: number;
  totalCount: number;
  processes: ProcessInfo[];
  threshold: number;
  exceededThreshold: boolean;
}

const PROCESS_COUNT_THRESHOLD = Number.parseInt(process.env.KIT_PROCESS_THRESHOLD || '20', 10);

const WHITESPACE_REGEX = /\s+/;

export class ProcessScanner {
  private lastNotificationTime = 0;
  private readonly NOTIFICATION_RATE_LIMIT = 60 * 60 * 1000; // 1 hour in milliseconds

  scanProcesses(): ProcessInfo[] {
    try {
      let command: string;
      const isDev = !app.isPackaged;

      if (process.platform === 'darwin') {
        // macOS: Use ps to find processes containing "Script Kit" or "ScriptKit"
        const searchTerm = isDev ? 'Electron' : '(Script Kit|ScriptKit)';
        command = `ps aux | grep -E "${searchTerm}" | grep -v grep`;
      } else if (process.platform === 'win32') {
        // Windows: Use wmic or Get-Process
        const searchTerm = isDev ? `"name like '%Electron%'"` : `"name like '%Script Kit%' or name like '%ScriptKit%'"`;
        command = `wmic process where ${searchTerm} get processid,name,commandline /format:csv`;
      } else {
        // Linux: Similar to macOS
        const searchTerm = isDev ? 'Electron' : '(Script Kit|ScriptKit)';
        command = `ps aux | grep -E "${searchTerm}" | grep -v grep`;
      }

      const output = execSync(command, { encoding: 'utf8' });
      return this.parseProcessOutput(output);
    } catch (error) {
      // grep returns exit code 1 when no matches found, which is not an error
      if (error instanceof Error && error.message.includes('Command failed') && error.message.includes('grep')) {
        return [];
      }
      log.error('Failed to scan processes:', error);
      return [];
    }
  }

  private parseProcessOutput(output: string): ProcessInfo[] {
    const processes: ProcessInfo[] = [];

    if (!output.trim()) {
      return processes;
    }

    if (process.platform === 'darwin' || process.platform === 'linux') {
      const lines = output.trim().split('\n');
      for (const line of lines) {
        const parts = line.split(WHITESPACE_REGEX);
        if (parts.length >= 11) {
          processes.push({
            pid: Number.parseInt(parts[1], 10),
            name: app.isPackaged ? 'Script Kit' : 'Electron',
            command: parts.slice(10).join(' '),
          });
        }
      }
    } else if (process.platform === 'win32') {
      // Parse Windows CSV output
      const lines = output.trim().split('\n').slice(1); // Skip header
      for (const line of lines) {
        const parts = line.split(',');
        if (parts.length >= 4) {
          const [, commandline, name, pid] = parts;
          if (pid && name) {
            // Remove surrounding quotes from command line if present
            let command = commandline?.trim() || '';
            if (command.startsWith('"') && command.endsWith('"')) {
              command = command.slice(1, -1);
            }
            processes.push({
              pid: Number.parseInt(pid.trim(), 10),
              name: name.trim(),
              command,
            });
          }
        }
      }
    }

    return processes;
  }

  async performScan(): Promise<ProcessScanResult> {
    const processes = this.scanProcesses();
    const result: ProcessScanResult = {
      timestamp: Date.now(),
      totalCount: processes.length,
      processes,
      threshold: PROCESS_COUNT_THRESHOLD,
      exceededThreshold: processes.length > PROCESS_COUNT_THRESHOLD,
    };

    await this.logResult(result);

    if (result.exceededThreshold) {
      await this.sendNotification(result);
    }

    return result;
  }

  private async logResult(result: ProcessScanResult) {
    const logEntry = `${new Date(result.timestamp).toISOString()} - Process Count: ${result.totalCount} (Threshold: ${result.threshold})${result.exceededThreshold ? ' [EXCEEDED]' : ''}\n`;

    try {
      await appendFile(processLogPath, logEntry);

      // Also log to main electron log
      if (result.exceededThreshold) {
        log.warn(`Process count exceeded threshold: ${result.totalCount} > ${result.threshold}`);
      } else {
        log.info(`Process count normal: ${result.totalCount}`);
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
}

export const processScanner = new ProcessScanner();
