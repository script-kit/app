import { beforeAll, afterAll, describe, it, expect, vi } from 'vitest';
import path from 'node:path';
import { ProcessType } from '@johnlindquist/kit/core/enum';
import type { Script } from '@johnlindquist/kit';

// Mock process.resourcesPath
const originalProcess = process;
vi.stubGlobal('process', {
  ...originalProcess,
  resourcesPath: '/path/to/resources',
});

// Mock modules
vi.mock('valtio');
vi.mock('valtio/utils');
vi.mock('electron');
vi.mock('electron-store');
vi.mock('./kit');
vi.mock('./state');
vi.mock('./system');
vi.mock('./logs');
vi.mock('./process');
vi.mock('./version');
vi.mock('./install');
vi.mock('./main.dev.templates');
vi.mock('./shortcuts');
vi.mock('./system-events');
vi.mock('./background');
vi.mock('./schedule');
vi.mock('./watch');
vi.mock('./tick');
vi.mock('./tray');
vi.mock('./messages');
vi.mock('./prompt');
vi.mock('@johnlindquist/kit/core/utils');
vi.mock('../shared/assets');
vi.mock('electron/main');
vi.mock('electron-context-menu');

// Import after mocks
import { onScriptChanged } from './watcher';

describe('watcher.ts - onScriptChanged Tests', () => {
  beforeAll(() => {
    vi.clearAllMocks();
  });

  afterAll(() => {
    vi.clearAllMocks();
    // Restore process
    vi.stubGlobal('process', originalProcess);
  });

  it('should log when a script changes', async () => {
    const scriptPath = path.join('/mocked/kenv', 'scripts', 'change-me.ts');
    const mockScript = {
      filePath: scriptPath,
      name: 'change-me.ts',
      kenv: '',
      command: 'node',
      type: ProcessType.Prompt,
      id: 'test-script',
    } satisfies Script;

    await onScriptChanged('change', mockScript);

    const { scriptLog } = await import('./logs');
    expect(scriptLog.info).toHaveBeenCalledWith('🚨 onScriptChanged', 'change', mockScript.filePath);
  });
});
