import { vi } from 'vitest';

vi.mock('../src/main/kit', () => ({
  runPromptProcess: vi.fn(),
}));

// Use hoisted mocks for modules that need them
const mockElectronBase = vi.hoisted(() => {
  const handlers = new Map();

  return {
    app: {
      getPath: vi.fn((name: string) => {
        switch (name) {
          case 'userData':
            return '/Users/test/Library/Application Support/ScriptKit';
          case 'downloads':
            return '/Users/test/Downloads';
          case 'home':
            return '/Users/test';
          default:
            return '/Users/test';
        }
      }),
      quit: vi.fn(),
      exit: vi.fn(),
      getName: vi.fn(() => 'ScriptKit'),
      getVersion: vi.fn(() => '1.0.0'),
      isReady: vi.fn(() => true),
      whenReady: vi.fn(() => Promise.resolve()),
      on: vi.fn(),
      once: vi.fn(),
      removeListener: vi.fn(),
      removeAllListeners: vi.fn(),
    },
    BrowserWindow: vi.fn().mockImplementation(() => ({
      loadURL: vi.fn(),
      on: vi.fn(),
      once: vi.fn(),
      removeListener: vi.fn(),
      removeAllListeners: vi.fn(),
      close: vi.fn(),
      destroy: vi.fn(),
      show: vi.fn(),
      hide: vi.fn(),
      focus: vi.fn(),
      blur: vi.fn(),
      webContents: {
        on: vi.fn(),
        once: vi.fn(),
        removeListener: vi.fn(),
        removeAllListeners: vi.fn(),
        send: vi.fn(),
        executeJavaScript: vi.fn(),
      },
    })),
    crashReporter: {
      start: vi.fn(),
    },
    powerMonitor: {
      on: vi.fn((event: string, handler: Function) => {
        // Store the handler so listeners() can return it
        if (!handlers.has(event)) {
          handlers.set(event, []);
        }
        handlers.get(event).push(handler);
      }),
      addListener: vi.fn((event: string, handler: Function) => {
        // Store the handler so listeners() can return it
        if (!handlers.has(event)) {
          handlers.set(event, []);
        }
        handlers.get(event).push(handler);
      }),
      once: vi.fn(),
      removeListener: vi.fn(),
      removeAllListeners: vi.fn(),
      listeners: vi.fn((event: string) => {
        return handlers.get(event) || [];
      }),
    },
    nativeTheme: {
      shouldUseDarkColors: false,
      on: vi.fn(),
      once: vi.fn(),
      removeListener: vi.fn(),
      removeAllListeners: vi.fn(),
    },
  };
});

vi.mock('electron', () => ({
  default: mockElectronBase,
  ...mockElectronBase,
}));

vi.mock('electron-log', () => ({
  default: {
    create: vi.fn(() => ({
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
      verbose: vi.fn(),
      silly: vi.fn(),
      transports: {
        file: { level: 'info' },
        console: { level: false },
        ipc: { level: false },
      },
    })),
    transports: {
      file: { level: 'info' },
      console: { level: false },
      ipc: { level: false },
    },
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    verbose: vi.fn(),
    silly: vi.fn(),
  },
  create: vi.fn(() => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    verbose: vi.fn(),
    silly: vi.fn(),
    transports: {
      file: { level: 'info' },
      console: { level: false },
      ipc: { level: false },
    },
  })),
  transports: {
    file: { level: 'info' },
    console: { level: false },
    ipc: { level: false },
  },
  info: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  debug: vi.fn(),
  verbose: vi.fn(),
  silly: vi.fn(),
}));

import { ProcessType } from '@johnlindquist/kit/core/enum';
import { powerMonitor } from 'electron';
import { runPromptProcess } from '../src/main/kit';
import { systemScriptChanged } from '../src/main/system-events';
import { Trigger } from '../src/shared/enums';

describe('system-events duplicate registration', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('should not trigger script twice when registering same system events', () => {
    const mockRunPromptProcess = runPromptProcess as any;

    // Register the same script with same system events twice
    const testScript = {
      filePath: '/test/path/script.ts',
      kenv: '',
      system: 'resume' as const,
      type: ProcessType.System,
      command: 'node',
      id: 'test-script',
      name: 'test-script',
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

  it.skip('should register multiple different system events', () => {
    const mockRunPromptProcess = runPromptProcess as any;

    const testScript = {
      filePath: '/test/path/multi-event-script.ts',
      kenv: '',
      system: 'suspend lock-screen' as any,
      type: ProcessType.System,
      command: 'node',
      id: 'test-multi-event-script',
      name: 'test-multi-event-script',
    };

    // Register the script with multiple system events
    systemScriptChanged(testScript);

    // Check that handlers were registered for both events
    const suspendHandlers = powerMonitor.listeners('suspend') as any[];
    const lockHandlers = powerMonitor.listeners('lock-screen') as any[];

    expect(suspendHandlers.length).toBeGreaterThan(0);
    expect(lockHandlers.length).toBeGreaterThan(0);

    // Trigger each event once
    const suspendHandler = suspendHandlers[suspendHandlers.length - 1]; // Get the last one
    const lockHandler = lockHandlers[lockHandlers.length - 1]; // Get the last one

    suspendHandler();
    lockHandler();

    // Should have been called twice (once for each event)
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
