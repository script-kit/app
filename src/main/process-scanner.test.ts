import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ProcessScanner } from './process-scanner';
import * as child_process from 'node:child_process';
import * as fs from 'node:fs/promises';
import { Notification } from 'electron';

// Mock modules
vi.mock('node:child_process');
vi.mock('node:fs/promises');
vi.mock('electron', () => ({
  Notification: vi.fn().mockImplementation(() => ({
    show: vi.fn(),
    on: vi.fn(),
  })),
  shell: {
    openPath: vi.fn(),
  },
  app: {
    isPackaged: true,
  },
}));
vi.mock('./logs', () => ({
  processLog: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
  processLogPath: '/mock/kit/path/logs/process.log',
}));

describe('ProcessScanner', () => {
  let scanner: ProcessScanner;
  let originalPlatform: PropertyDescriptor | undefined;

  beforeEach(() => {
    scanner = new ProcessScanner();
    vi.clearAllMocks();
    originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform');
  });

  afterEach(() => {
    if (originalPlatform) {
      Object.defineProperty(process, 'platform', originalPlatform);
    }
  });

  describe('scanProcesses', () => {
    it('should parse macOS process output correctly', () => {
      Object.defineProperty(process, 'platform', {
        value: 'darwin',
        configurable: true,
      });

      const mockOutput = `user  1234  0.0  0.1  123456  78910 ??  S    10:00AM   0:00.50 /Applications/Script Kit.app/Contents/MacOS/Script Kit
user  5678  0.0  0.1  123456  78910 ??  S    10:00AM   0:00.50 /Applications/Script Kit.app/Contents/Frameworks/Script Kit Helper.app/Contents/MacOS/Script Kit Helper`;

      vi.mocked(child_process.execSync).mockReturnValue(mockOutput);

      const processes = scanner.scanProcesses();

      expect(processes).toHaveLength(2);
      expect(processes[0]).toEqual({
        pid: 1234,
        name: 'Script Kit',
        command: '/Applications/Script Kit.app/Contents/MacOS/Script Kit',
      });
      expect(processes[1]).toEqual({
        pid: 5678,
        name: 'Script Kit',
        command:
          '/Applications/Script Kit.app/Contents/Frameworks/Script Kit Helper.app/Contents/MacOS/Script Kit Helper',
      });
    });

    it('should parse Windows process output correctly', () => {
      Object.defineProperty(process, 'platform', {
        value: 'win32',
        configurable: true,
      });

      const mockOutput = `Node,CommandLine,Name,ProcessId
DESKTOP-ABC,"C:\\Program Files\\Script Kit\\Script Kit.exe",Script Kit.exe,1234
DESKTOP-ABC,"C:\\Program Files\\Script Kit\\Script Kit.exe --type=renderer",Script Kit.exe,5678`;

      vi.mocked(child_process.execSync).mockReturnValue(mockOutput);

      const processes = scanner.scanProcesses();

      expect(processes).toHaveLength(2);
      expect(processes[0]).toEqual({
        pid: 1234,
        name: 'Script Kit.exe',
        command: 'C:\\Program Files\\Script Kit\\Script Kit.exe',
      });
    });

    it('should handle scan failures gracefully', () => {
      vi.mocked(child_process.execSync).mockImplementation(() => {
        throw new Error('Command failed');
      });

      const processes = scanner.scanProcesses();
      expect(processes).toEqual([]);
    });

    it('should handle empty grep results on macOS/Linux', () => {
      Object.defineProperty(process, 'platform', {
        value: 'darwin',
        configurable: true,
      });

      const error = new Error('Command failed: grep');
      vi.mocked(child_process.execSync).mockImplementation(() => {
        throw error;
      });

      const processes = scanner.scanProcesses();
      expect(processes).toEqual([]);
    });
  });

  describe('performScan', () => {
    it('should log results and not send notification when under threshold', async () => {
      vi.mocked(child_process.execSync).mockReturnValue('');
      vi.mocked(fs.appendFile).mockResolvedValue(undefined);

      const result = await scanner.performScan();

      expect(result.totalCount).toBe(0);
      expect(result.exceededThreshold).toBe(false);
      expect(fs.appendFile).toHaveBeenCalled();
      expect(Notification).not.toHaveBeenCalled();
    });

    it('should send notification when threshold is exceeded', async () => {
      Object.defineProperty(process, 'platform', {
        value: 'darwin',
        configurable: true,
      });

      // Create mock output with 21 processes (exceeds threshold of 20)
      const mockProcesses = Array.from(
        { length: 21 },
        (_, i) =>
          `user  ${1000 + i}  0.0  0.1  123456  78910 ??  S    10:00AM   0:00.50 /Applications/Script Kit.app/process${i}`,
      ).join('\n');

      vi.mocked(child_process.execSync).mockReturnValue(mockProcesses);
      vi.mocked(fs.appendFile).mockResolvedValue(undefined);

      const result = await scanner.performScan();

      expect(result.totalCount).toBe(21);
      expect(result.exceededThreshold).toBe(true);
      expect(Notification).toHaveBeenCalled();
    });

    it('should respect notification rate limiting', async () => {
      Object.defineProperty(process, 'platform', {
        value: 'darwin',
        configurable: true,
      });

      // Create mock output with 21 processes
      const mockProcesses = Array.from(
        { length: 21 },
        (_, i) =>
          `user  ${1000 + i}  0.0  0.1  123456  78910 ??  S    10:00AM   0:00.50 /Applications/Script Kit.app/process${i}`,
      ).join('\n');

      vi.mocked(child_process.execSync).mockReturnValue(mockProcesses);
      vi.mocked(fs.appendFile).mockResolvedValue(undefined);

      // First scan should send notification
      await scanner.performScan();
      expect(Notification).toHaveBeenCalledTimes(1);

      // Second scan should not send notification due to rate limiting
      await scanner.performScan();
      expect(Notification).toHaveBeenCalledTimes(1); // Still only 1
    });
  });
});
