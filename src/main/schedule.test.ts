import path from 'node:path';
import type { Script } from '@johnlindquist/kit';
import { ProcessType } from '@johnlindquist/kit/core/enum';
import schedule from 'node-schedule';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Trigger } from '../shared/enums';

// Mock modules
vi.mock('node-schedule');
vi.mock('./logs');
vi.mock('electron-log');
vi.mock('./kit', () => ({
  runPromptProcess: vi.fn(),
}));
vi.mock('./state', () => ({
  kitState: {
    trustedKenvs: [],
  },
  scheduleMap: new Map(),
}));
vi.mock('@johnlindquist/kit/core/utils');

import { runPromptProcess } from './kit';
import { scheduleLog as log } from './logs';
// Import after mocks
import { cancelJob, scheduleScriptChanged, sleepSchedule } from './schedule';
import { kitState, scheduleMap } from './state';

describe('Schedule Resume/Suspend Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset scheduleMap before each test
    scheduleMap.clear();
  });

  afterEach(() => {
    vi.clearAllMocks();
    scheduleMap.clear();
  });

  it('should cancel all scheduled jobs when system sleeps', () => {
    // Setup test data
    const scriptPath1 = path.join('/test', 'script1.ts');
    const scriptPath2 = path.join('/test', 'script2.ts');
    const mockJob1 = { name: 'job1', cancel: vi.fn(), cancelNext: vi.fn() };
    const mockJob2 = { name: 'job2', cancel: vi.fn(), cancelNext: vi.fn() };

    // Mock schedule.cancelJob
    const cancelJobSpy = vi.spyOn(schedule, 'cancelJob').mockImplementation(() => true);

    // Add jobs to scheduleMap
    scheduleMap.set(scriptPath1, mockJob1 as any);
    scheduleMap.set(scriptPath2, mockJob2 as any);

    // Call sleepSchedule
    sleepSchedule();

    // Verify all jobs were cancelled
    expect(cancelJobSpy).toHaveBeenCalledTimes(2);
    expect(mockJob1.cancel).toHaveBeenCalledWith(true);
    expect(mockJob2.cancel).toHaveBeenCalledWith(true);
    expect(scheduleMap.size).toBe(0);
    expect(log.info).toHaveBeenCalledWith('[SLEEP_SCHEDULE] Computer sleeping. Canceling all scheduled jobs...');
  });

  it('should re-schedule scripts when system resumes', async () => {
    // Setup test data
    const scriptPath = path.join('/test', 'scheduled-script.ts');
    const mockScript: Script = {
      filePath: scriptPath,
      name: 'scheduled-script.ts',
      kenv: '',
      command: 'node',
      type: ProcessType.Prompt,
      schedule: '*/5 * * * *', // Run every 5 minutes
      id: 'test-script',
    };

    // Mock schedule.scheduleJob
    const mockScheduleJob = vi.fn().mockReturnValue({ name: 'test-job' });
    (schedule.scheduleJob as any) = mockScheduleJob;

    // Mock kitState.trustedKenvs
    kitState.trustedKenvs = [];

    // Schedule the script
    scheduleScriptChanged(mockScript);

    // Verify script was scheduled
    expect(mockScheduleJob).toHaveBeenCalledTimes(1);
    expect(mockScheduleJob.mock.calls[0][0]).toBe(scriptPath);
    expect(mockScheduleJob.mock.calls[0][1]).toBe('*/5 * * * *');
    expect(scheduleMap.has(scriptPath)).toBe(true);

    // Simulate sleep
    sleepSchedule();

    // Verify job was cancelled
    expect(scheduleMap.size).toBe(0);

    // Simulate resume by re-scheduling
    scheduleScriptChanged(mockScript);

    // Verify script was re-scheduled
    expect(mockScheduleJob).toHaveBeenCalledTimes(2);
    expect(scheduleMap.has(scriptPath)).toBe(true);

    // Verify the scheduled function runs the script correctly
    const scheduledFn = mockScheduleJob.mock.calls[1][2];
    await scheduledFn();

    expect(runPromptProcess).toHaveBeenCalledWith(
      scriptPath,
      [],
      expect.objectContaining({
        force: false,
        trigger: Trigger.Schedule,
        sponsorCheck: false,
      }),
    );
  });

  it('should not schedule untrusted kenv scripts', () => {
    const scriptPath = path.join('/test', 'untrusted-script.ts');
    const mockScript: Script = {
      filePath: scriptPath,
      name: 'untrusted-script.ts',
      kenv: 'untrusted-kenv',
      command: 'node',
      type: ProcessType.Prompt,
      schedule: '*/5 * * * *',
      id: 'test-script',
    };

    // Mock empty trustedKenvs array
    kitState.trustedKenvs = [];

    // Attempt to schedule untrusted script
    scheduleScriptChanged(mockScript);

    // Verify script was not scheduled
    expect(scheduleMap.has(scriptPath)).toBe(false);
    expect(log.info).toHaveBeenCalledWith(expect.stringContaining('not in a trusted kenv'));
  });

  it('should handle canceling non-existent jobs gracefully', () => {
    const nonExistentPath = path.join('/test', 'non-existent.ts');

    // Mock schedule.cancelJob
    const cancelJobSpy = vi.spyOn(schedule, 'cancelJob');

    // Attempt to cancel non-existent job
    const result = cancelJob(nonExistentPath);

    // Verify behavior
    expect(result).toBe(false);
    expect(cancelJobSpy).not.toHaveBeenCalled();
  });

  it('should log errors when job cancellation fails', () => {
    const scriptPath = path.join('/test', 'error-script.ts');
    const mockJob = {
      name: 'error-job',
      cancel: vi.fn().mockImplementation(() => {
        throw new Error('Cancel failed');
      }),
      cancelNext: vi.fn(),
    };

    // Add job to scheduleMap
    scheduleMap.set(scriptPath, mockJob as any);

    // Mock schedule.cancelJob to throw
    vi.spyOn(schedule, 'cancelJob').mockImplementation(() => {
      throw new Error('Cancel failed');
    });

    // Attempt to cancel job
    cancelJob(scriptPath);

    // Verify error was logged
    expect(log.error).toHaveBeenCalledWith(expect.stringContaining('[CANCEL_JOB] Error canceling'), expect.any(Error));
  });

  it('should handle re-scheduling of previously scheduled scripts', () => {
    const scriptPath = path.join('/test', 'reschedule-script.ts');
    const mockScript: Script = {
      filePath: scriptPath,
      name: 'reschedule-script.ts',
      kenv: '',
      command: 'node',
      type: ProcessType.Prompt,
      schedule: '*/10 * * * *',
      id: 'test-script',
    };

    // Mock schedule.scheduleJob
    const mockScheduleJob = vi.fn().mockReturnValue({ name: 'test-job' });
    (schedule.scheduleJob as any) = mockScheduleJob;

    // Schedule script first time
    scheduleScriptChanged(mockScript);

    // Verify initial scheduling
    expect(mockScheduleJob).toHaveBeenCalledTimes(1);
    expect(scheduleMap.has(scriptPath)).toBe(true);

    // Schedule same script again
    scheduleScriptChanged(mockScript);

    // Verify old job was cancelled and new one was scheduled
    expect(mockScheduleJob).toHaveBeenCalledTimes(2);
    expect(scheduleMap.has(scriptPath)).toBe(true);
    expect(log.info).toHaveBeenCalledWith(expect.stringContaining('Script exists. Reschedule:'));
  });
});
