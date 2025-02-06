import { jest } from '@jest/globals';
import { systemScriptChanged } from '../src/main/system-events';
import { runPromptProcess } from '../src/main/kit';
import { powerMonitor } from 'electron';
import { Trigger } from '../src/shared/enums';

jest.mock('../src/main/kit');
jest.mock('electron-log');

describe('system-events duplicate registration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('should not trigger script twice when registering same system events', () => {
    const mockRunPromptProcess = runPromptProcess as jest.MockedFunction<typeof runPromptProcess>;

    // Register the same script with same system events twice
    const testScript = {
      filePath: '/test/path/script.ts',
      kenv: '',
      system: 'resume',
      type: 'script',
    };

    // Register first time
    systemScriptChanged(testScript);

    // Register second time with same events
    systemScriptChanged(testScript);

    // Simulate the system event
    const resumeHandler = (powerMonitor.listeners('resume') as any[])[0];
    resumeHandler();

    // Assert runPromptProcess was only called once
    expect(mockRunPromptProcess).toHaveBeenCalledTimes(1);
    expect(mockRunPromptProcess).toHaveBeenCalledWith(
      testScript.filePath,
      [],
      expect.objectContaining({
        trigger: Trigger.System,
        force: false,
      }),
    );
  });

  it('should debounce rapid system events', () => {
    const mockRunPromptProcess = runPromptProcess as jest.MockedFunction<typeof runPromptProcess>;

    const testScript = {
      filePath: '/test/path/script.ts',
      kenv: '',
      system: 'resume',
      type: 'script',
    };

    // Register the script
    systemScriptChanged(testScript);

    // Get the resume handler
    const resumeHandler = (powerMonitor.listeners('resume') as any[])[0];

    // Simulate rapid resume events
    resumeHandler(); // First call - should execute immediately due to leading: true
    resumeHandler(); // Should be debounced
    resumeHandler(); // Should be debounced

    // Fast-forward time by 100ms (less than debounce time)
    jest.advanceTimersByTime(100);
    resumeHandler(); // Should still be debounced

    // Fast-forward past the debounce time
    jest.advanceTimersByTime(250);
    resumeHandler(); // Should execute again as debounce period passed

    // Assert runPromptProcess was only called twice
    // Once for the first call (leading edge)
    // And once after the debounce period
    expect(mockRunPromptProcess).toHaveBeenCalledTimes(2);
    expect(mockRunPromptProcess).toHaveBeenCalledWith(
      testScript.filePath,
      [],
      expect.objectContaining({
        trigger: Trigger.System,
        force: false,
      }),
    );
  });
});
