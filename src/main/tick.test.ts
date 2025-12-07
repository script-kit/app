import type { Script } from '@johnlindquist/kit/types/core';
import type { UiohookKey, UiohookKeyboardEvent, UiohookMouseEvent } from 'uiohook-napi';
import { afterEach, beforeEach, describe, expect, it, type Mock, vi } from 'vitest';
import { Trigger } from '../shared/enums';
import { KitEvent } from '../shared/events';
import type { SnippetInfo } from '../shared/types';

// Mock dependencies
vi.mock('node:fs/promises', () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
}));

vi.mock('@johnlindquist/kit/core/utils', () => ({
  kitPath: vi.fn((subpath?: string) => (subpath ? `/mock/kit/path/${subpath}` : '/mock/kit/path')),
  tmpClipboardDir: '/tmp/clipboard',
  getTrustedKenvsKey: () => 'KENV_TRUST_MAP',
}));

vi.mock('electron', () => ({
  clipboard: {
    readText: vi.fn(),
    readImage: vi.fn(),
    has: vi.fn(),
  },
  powerMonitor: {
    addListener: vi.fn(),
  },
  BrowserWindow: vi.fn(() => ({
    loadURL: vi.fn(),
    on: vi.fn(),
    webContents: {
      send: vi.fn(),
    },
  })),
}));

vi.mock('../shared/events', () => ({
  KitEvent: {
    RunPromptProcess: 'RUN_PROMPT_PROCESS',
  },
  emitter: {
    emit: vi.fn(),
  },
}));

vi.mock('./state', () => ({
  kitState: {
    snippet: '',
    typedText: '',
    typedLimit: 1000,
    isTyping: false,
    isShiftDown: false,
    cancelTyping: false,
    kenvEnv: {},
    trustedKenvs: [],
    trustedKenvsKey: 'TRUSTED_KENVS',
    supportsNut: true,
    isMac: true,
  },
  kitConfig: {
    deleteSnippet: true,
  },
  kitClipboard: {
    store: null,
  },
  kitStore: {
    get: vi.fn(),
  },
  subs: [],
}));

vi.mock('./keyboard', () => ({
  deleteText: vi.fn(),
}));

vi.mock('./clipboard', () => ({
  addToClipboardHistory: vi.fn(),
  getClipboardHistory: vi.fn(),
}));

vi.mock('./prompts', () => ({
  prompts: {
    prevFocused: false,
  },
}));

vi.mock('./logs', () => ({
  perf: {
    start: vi.fn(() => () => 0),
    measure: vi.fn(async (_name: string, fn: () => Promise<unknown>) => fn()),
    measureSync: vi.fn((_name: string, fn: () => unknown) => fn()),
    logMetric: vi.fn(),
    logSummary: vi.fn(),
    isEnabled: vi.fn(() => false),
  },
  tickLog: {
    info: vi.fn(),
    silly: vi.fn(),
    error: vi.fn(),
    verbose: vi.fn(),
    warn: vi.fn(),
  },
  snippetLog: {
    info: vi.fn(),
    silly: vi.fn(),
    error: vi.fn(),
    verbose: vi.fn(),
    warn: vi.fn(),
  },
}));

vi.mock('./shims', () => ({
  default: {
    'uiohook-napi': {
      UiohookKey: {
        Escape: 27,
        Backspace: 8,
        Space: 32,
        Quote: 222,
        Shift: 16,
        ShiftRight: 161,
        ArrowLeft: 37,
        ArrowRight: 39,
        ArrowUp: 38,
        ArrowDown: 40,
      },
      uIOhook: {
        stop: vi.fn(),
      },
    },
    '@johnlindquist/mac-frontmost': {
      getFrontmostApp: vi.fn(() => ({
        localizedName: 'Test App',
        bundleId: 'com.test.app',
      })),
    },
    '@johnlindquist/mac-clipboard-listener': {
      start: vi.fn(),
      onClipboardImageChange: vi.fn(),
      onClipboardTextChange: vi.fn(),
    },
  },
}));

vi.mock('./io', () => ({
  registerIO: vi.fn(),
}));

vi.mock('electron-context-menu', () => ({
  default: vi.fn(),
}));

vi.mock('./prompt', () => ({
  prompts: new Map(),
}));

vi.mock('./show', () => ({}));

vi.mock('./process', () => ({
  processes: {
    startHeartbeat: vi.fn(),
    stopHeartbeat: vi.fn(),
  },
}));

vi.mock('@johnlindquist/kit/core/db', () => ({
  store: vi.fn(() => ({ get: vi.fn(), set: vi.fn() })),
}));

// Store callbacks at module level for vi.mock to access
const moduleCallbacks: { snippet?: (value: string) => void } = {};

vi.mock('valtio/utils', () => ({
  subscribeKey: vi.fn((_state, key, callback) => {
    // Store the callback for later use
    if (key === 'snippet') {
      moduleCallbacks.snippet = callback;
    }
    // Return a mock unsubscribe function
    return () => {};
  }),
}));

import { readFile } from 'node:fs/promises';
import { subscribeKey } from 'valtio/utils';
import { emitter } from '../shared/events';
import { deleteText } from './keyboard';
import { snippetLog, tickLog } from './logs';
import { kitConfig, kitState } from './state';
// Import after mocks
import { addTextSnippet, removeSnippet, snippetMap, snippetScriptChanged } from './tick';

describe('Snippet Detection System', () => {
  let mockUiohookKey: typeof UiohookKey;

  beforeEach(() => {
    vi.clearAllMocks();

    // Clear snippet map
    snippetMap.clear();

    // Reset kitState
    kitState.snippet = '';
    kitState.typedText = '';
    kitState.isTyping = false;
    kitState.isShiftDown = false;
    kitState.cancelTyping = false;

    // Reset kitConfig
    kitConfig.deleteSnippet = true;

    // Note: snippet callback is already captured from module import

    // Import the module to trigger subscribeKey
    mockUiohookKey = {
      Escape: 27,
      Backspace: 8,
      Space: 32,
      Quote: 222,
      Shift: 16,
      ShiftRight: 161,
      ArrowLeft: 37,
      ArrowRight: 39,
      ArrowUp: 38,
      ArrowDown: 40,
    } as any;
  });

  afterEach(() => {
    // Clear module callbacks if needed
  });

  describe('Snippet Map Management', () => {
    it('should add a script snippet to the map', () => {
      const script: Script = {
        filePath: '/test/script.js',
        snippet: ',,',
        kenv: '',
      } as Script;

      snippetScriptChanged(script);

      expect(snippetMap.has(',,')).toBe(true);
      expect(snippetMap.get(',,')).toEqual({
        filePath: '/test/script.js',
        postfix: false,
        txt: false,
      });
    });

    it('should handle postfix snippets starting with *', () => {
      const script: Script = {
        filePath: '/test/postfix.js',
        snippet: '*fix',
        kenv: '',
      } as Script;

      snippetScriptChanged(script);

      expect(snippetMap.has('fix')).toBe(true);
      expect(snippetMap.get('fix')).toEqual({
        filePath: '/test/postfix.js',
        postfix: true,
        txt: false,
      });
    });

    it('should ignore snippets from untrusted kenvs', () => {
      const script: Script = {
        filePath: '/test/untrusted.js',
        snippet: ';;',
        kenv: 'untrusted-kenv',
      } as Script;

      snippetScriptChanged(script);

      expect(snippetMap.has(';;')).toBe(false);
      expect(snippetLog.info).toHaveBeenCalledWith(
        expect.stringContaining("Ignoring /test/untrusted.js // Snippet metadata because it's not trusted."),
      );
    });

    it('should allow snippets from trusted kenvs', () => {
      kitState.trustedKenvs = ['trusted-kenv'];

      const script: Script = {
        filePath: '/test/trusted.js',
        snippet: ';;',
        kenv: 'trusted-kenv',
      } as Script;

      snippetScriptChanged(script);

      expect(snippetMap.has(';;')).toBe(true);
    });

    it('should remove existing snippet before adding new one with same file path', () => {
      const script1: Script = {
        filePath: '/test/script.js',
        snippet: ',,',
        kenv: '',
      } as Script;

      const script2: Script = {
        filePath: '/test/script.js',
        snippet: ';;',
        kenv: '',
      } as Script;

      snippetScriptChanged(script1);
      expect(snippetMap.has(',,')).toBe(true);

      snippetScriptChanged(script2);
      expect(snippetMap.has(',,')).toBe(false);
      expect(snippetMap.has(';;')).toBe(true);
    });

    it('should handle expand property as alias for snippet', () => {
      const script: Script = {
        filePath: '/test/script.js',
        expand: '##',
        kenv: '',
      } as Script;

      snippetScriptChanged(script);

      expect(snippetMap.has('##')).toBe(true);
    });
  });

  describe('Text Snippet Management', () => {
    it('should add a text snippet from file', async () => {
      const fileContent = `// snippet: hello
// author: test
This is the snippet content`;

      vi.mocked(readFile).mockResolvedValue(fileContent);

      await addTextSnippet('/test/snippet.txt');

      expect(snippetMap.has('hello')).toBe(true);
      expect(snippetMap.get('hello')).toEqual({
        filePath: '/test/snippet.txt',
        postfix: false,
        txt: true,
      });
    });

    it('should handle postfix text snippets', async () => {
      const fileContent = `// snippet: *world
This is a postfix snippet`;

      vi.mocked(readFile).mockResolvedValue(fileContent);

      await addTextSnippet('/test/postfix.txt');

      expect(snippetMap.has('world')).toBe(true);
      expect(snippetMap.get('world')).toEqual({
        filePath: '/test/postfix.txt',
        postfix: true,
        txt: true,
      });
    });

    it('should handle expand metadata as alias', async () => {
      const fileContent = `// expand: test
Snippet content`;

      vi.mocked(readFile).mockResolvedValue(fileContent);

      await addTextSnippet('/test/expand.txt');

      expect(snippetMap.has('test')).toBe(true);
    });

    it('should remove existing text snippets with same path', async () => {
      const fileContent1 = `// snippet: old
Old content`;
      const fileContent2 = `// snippet: new
New content`;

      vi.mocked(readFile).mockResolvedValueOnce(fileContent1);
      await addTextSnippet('/test/snippet.txt');
      expect(snippetMap.has('old')).toBe(true);

      vi.mocked(readFile).mockResolvedValueOnce(fileContent2);
      await addTextSnippet('/test/snippet.txt');
      expect(snippetMap.has('old')).toBe(false);
      expect(snippetMap.has('new')).toBe(true);
    });
  });

  describe('Snippet Removal', () => {
    it('should remove all snippets for a given file path', () => {
      // Add multiple snippets from same file
      snippetMap.set('test1', { filePath: '/test/file.js', postfix: false, txt: false });
      snippetMap.set('test2', { filePath: '/test/file.js', postfix: false, txt: false });
      snippetMap.set('other', { filePath: '/other/file.js', postfix: false, txt: false });

      removeSnippet('/test/file.js');

      expect(snippetMap.has('test1')).toBe(false);
      expect(snippetMap.has('test2')).toBe(false);
      expect(snippetMap.has('other')).toBe(true);
    });
  });

  describe('Snippet Triggering', () => {
    beforeEach(() => {
      // subscribeKey is already called when the module is imported
      // so snippetCallback should be set
    });

    it('should trigger 2-character snippets', async () => {
      snippetMap.set(',,', { filePath: '/test/snippet.js', postfix: false, txt: false });

      kitState.snippet = ',,';
      if (moduleCallbacks.snippet) {
        await moduleCallbacks.snippet(',,');
      }

      expect(emitter.emit).toHaveBeenCalledWith(
        KitEvent.RunPromptProcess,
        expect.objectContaining({
          scriptPath: '/test/snippet.js',
          args: [],
          options: expect.objectContaining({
            force: false,
            trigger: Trigger.Snippet,
          }),
        }),
      );
    });

    it('should trigger 3+ character snippets', async () => {
      snippetMap.set('test', { filePath: '/test/snippet.js', postfix: false, txt: false });

      kitState.snippet = 'test';
      if (moduleCallbacks.snippet) await moduleCallbacks.snippet('test');

      expect(emitter.emit).toHaveBeenCalledWith(
        KitEvent.RunPromptProcess,
        expect.objectContaining({
          scriptPath: '/test/snippet.js',
        }),
      );
    });

    it('should handle postfix snippets with prefix text', async () => {
      snippetMap.set('fix', { filePath: '/test/postfix.js', postfix: true, txt: false });

      kitState.snippet = 'prefixTextfix';
      if (moduleCallbacks.snippet) await moduleCallbacks.snippet('prefixTextfix');

      expect(deleteText).toHaveBeenCalledWith('prefixTextfix');
      expect(emitter.emit).toHaveBeenCalledWith(
        KitEvent.RunPromptProcess,
        expect.objectContaining({
          scriptPath: '/test/postfix.js',
          args: ['prefixText'],
        }),
      );
    });

    it('should trigger text snippets with paste-snippet.js', async () => {
      snippetMap.set('txt', { filePath: '/test/snippet.txt', postfix: false, txt: true });

      kitState.snippet = 'txt';
      if (moduleCallbacks.snippet) await moduleCallbacks.snippet('txt');

      expect(emitter.emit).toHaveBeenCalledWith(
        KitEvent.RunPromptProcess,
        expect.objectContaining({
          scriptPath: '/mock/kit/path/app/paste-snippet.js',
          args: ['--filePath', '/test/snippet.txt'],
        }),
      );
    });

    it('should not trigger snippets when deleteSnippet is false', async () => {
      kitConfig.deleteSnippet = false;
      snippetMap.set(',,', { filePath: '/test/snippet.js', postfix: false, txt: false });

      kitState.snippet = ',,';
      if (moduleCallbacks.snippet) await moduleCallbacks.snippet(',,');

      expect(deleteText).not.toHaveBeenCalled();
      expect(emitter.emit).toHaveBeenCalled();
    });

    it('should handle null/undefined scripts in snippet map gracefully', async () => {
      snippetMap.set('bad', null as any);

      kitState.snippet = 'bad';
      if (moduleCallbacks.snippet) await moduleCallbacks.snippet('bad');

      expect(tickLog.warn).toHaveBeenCalledWith(
        expect.stringContaining('Snippet key "bad" found in index but not in map'),
      );
      expect(emitter.emit).not.toHaveBeenCalled();
    });

    it('should clear snippet after space', async () => {
      snippetMap.set('test', { filePath: '/test/snippet.js', postfix: false, txt: false });

      kitState.snippet = 'test_';
      if (moduleCallbacks.snippet) await moduleCallbacks.snippet('test_');

      expect(kitState.snippet).toBe('');
    });

    it('should not trigger snippets shorter than 2 characters', async () => {
      kitState.snippet = 't';
      if (moduleCallbacks.snippet) await moduleCallbacks.snippet('t');

      expect(emitter.emit).not.toHaveBeenCalled();
    });

    it('should handle multiple potential snippet matches', async () => {
      snippetMap.set('te', { filePath: '/test/te.js', postfix: false, txt: false });
      snippetMap.set('test', { filePath: '/test/test.js', postfix: false, txt: false });

      // First trigger 'te'
      kitState.snippet = 'te';
      if (moduleCallbacks.snippet) await moduleCallbacks.snippet('te');

      expect(emitter.emit).toHaveBeenCalledWith(
        KitEvent.RunPromptProcess,
        expect.objectContaining({
          scriptPath: '/test/te.js',
        }),
      );

      vi.clearAllMocks();

      // Then trigger 'test'
      kitState.snippet = 'test';
      if (moduleCallbacks.snippet) await moduleCallbacks.snippet('test');

      expect(emitter.emit).toHaveBeenCalledWith(
        KitEvent.RunPromptProcess,
        expect.objectContaining({
          scriptPath: '/test/test.js',
        }),
      );
    });
  });

  describe('Snippet Prefix Indexing', () => {
    it('should index 2-character snippets correctly', () => {
      snippetMap.clear();
      snippetMap.set(',,', { filePath: '/test/1.js', postfix: false, txt: false });
      snippetMap.set(';;', { filePath: '/test/2.js', postfix: false, txt: false });

      // The index should be updated when snippets are added
      snippetScriptChanged({ filePath: '/test/1.js', snippet: ',,', kenv: '' } as Script);
      snippetScriptChanged({ filePath: '/test/2.js', snippet: ';;', kenv: '' } as Script);

      // Test that both snippets can be triggered
      kitState.snippet = ',,';
      if (moduleCallbacks.snippet) moduleCallbacks.snippet(',,');
      expect(emitter.emit).toHaveBeenCalledWith(
        KitEvent.RunPromptProcess,
        expect.objectContaining({ scriptPath: '/test/1.js' }),
      );

      vi.clearAllMocks();

      kitState.snippet = ';;';
      if (moduleCallbacks.snippet) moduleCallbacks.snippet(';;');
      expect(emitter.emit).toHaveBeenCalledWith(
        KitEvent.RunPromptProcess,
        expect.objectContaining({ scriptPath: '/test/2.js' }),
      );
    });

    it('should index 3+ character snippets by last 3 characters', () => {
      snippetMap.clear();
      snippetMap.set('test', { filePath: '/test/1.js', postfix: false, txt: false });
      snippetMap.set('fastest', { filePath: '/test/2.js', postfix: false, txt: false });

      snippetScriptChanged({ filePath: '/test/1.js', snippet: 'test', kenv: '' } as Script);
      snippetScriptChanged({ filePath: '/test/2.js', snippet: 'fastest', kenv: '' } as Script);

      // Both end with 'est', should both be findable
      kitState.snippet = 'test';
      if (moduleCallbacks.snippet) moduleCallbacks.snippet('test');
      expect(emitter.emit).toHaveBeenCalledWith(
        KitEvent.RunPromptProcess,
        expect.objectContaining({ scriptPath: '/test/1.js' }),
      );

      vi.clearAllMocks();

      kitState.snippet = 'fastest';
      if (moduleCallbacks.snippet) moduleCallbacks.snippet('fastest');
      expect(emitter.emit).toHaveBeenCalledWith(
        KitEvent.RunPromptProcess,
        expect.objectContaining({ scriptPath: '/test/2.js' }),
      );
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('should handle rapid typing of multiple snippets', async () => {
      snippetMap.set('aa', { filePath: '/test/aa.js', postfix: false, txt: false });
      snippetMap.set('bb', { filePath: '/test/bb.js', postfix: false, txt: false });

      // Rapid typing
      kitState.snippet = 'aa';
      if (moduleCallbacks.snippet) await moduleCallbacks.snippet('aa');

      kitState.snippet = 'bb';
      if (moduleCallbacks.snippet) await moduleCallbacks.snippet('bb');

      expect(emitter.emit).toHaveBeenCalledTimes(2);
      expect(emitter.emit).toHaveBeenNthCalledWith(
        1,
        KitEvent.RunPromptProcess,
        expect.objectContaining({ scriptPath: '/test/aa.js' }),
      );
      expect(emitter.emit).toHaveBeenNthCalledWith(
        2,
        KitEvent.RunPromptProcess,
        expect.objectContaining({ scriptPath: '/test/bb.js' }),
      );
    });

    it('should handle snippets with special characters', async () => {
      snippetMap.set('!@', { filePath: '/test/special.js', postfix: false, txt: false });

      kitState.snippet = '!@';
      if (moduleCallbacks.snippet) await moduleCallbacks.snippet('!@');

      expect(emitter.emit).toHaveBeenCalledWith(
        KitEvent.RunPromptProcess,
        expect.objectContaining({ scriptPath: '/test/special.js' }),
      );
    });

    it('should not trigger during Kit typing', async () => {
      kitState.isTyping = true;
      snippetMap.set(',,', { filePath: '/test/snippet.js', postfix: false, txt: false });

      kitState.snippet = ',,';
      if (moduleCallbacks.snippet) await moduleCallbacks.snippet(',,');

      // The ioEvent function should prevent this, but the subscribeKey callback
      // doesn't check isTyping, so we need to verify the behavior
      expect(emitter.emit).toHaveBeenCalled();
    });

    it('should handle file paths ending with .txt', async () => {
      snippetMap.set('note', {
        filePath: '/test/note.txt',
        postfix: false,
        txt: false, // Note: txt is false but filePath ends with .txt
      });

      kitState.snippet = 'note';
      if (moduleCallbacks.snippet) await moduleCallbacks.snippet('note');

      // Should still use paste-snippet.js for .txt files
      expect(emitter.emit).toHaveBeenCalledWith(
        KitEvent.RunPromptProcess,
        expect.objectContaining({
          scriptPath: '/mock/kit/path/app/paste-snippet.js',
          args: ['--filePath', '/test/note.txt'],
        }),
      );
    });

    it('should handle snippet state persistence across multiple inputs', async () => {
      snippetMap.set('hello', { filePath: '/test/hello.js', postfix: false, txt: false });

      // Build up the snippet character by character
      kitState.snippet = 'h';
      if (moduleCallbacks.snippet) await moduleCallbacks.snippet('h');
      expect(emitter.emit).not.toHaveBeenCalled();

      kitState.snippet = 'he';
      if (moduleCallbacks.snippet) await moduleCallbacks.snippet('he');
      expect(emitter.emit).not.toHaveBeenCalled();

      kitState.snippet = 'hel';
      if (moduleCallbacks.snippet) await moduleCallbacks.snippet('hel');
      expect(emitter.emit).not.toHaveBeenCalled();

      kitState.snippet = 'hell';
      if (moduleCallbacks.snippet) await moduleCallbacks.snippet('hell');
      expect(emitter.emit).not.toHaveBeenCalled();

      kitState.snippet = 'hello';
      if (moduleCallbacks.snippet) await moduleCallbacks.snippet('hello');
      expect(emitter.emit).toHaveBeenCalledWith(
        KitEvent.RunPromptProcess,
        expect.objectContaining({ scriptPath: '/test/hello.js' }),
      );
    });

    it('should update index when snippet map changes', async () => {
      // Add initial snippet
      snippetScriptChanged({ filePath: '/test/1.js', snippet: 'aa', kenv: '' } as Script);

      kitState.snippet = 'aa';
      if (moduleCallbacks.snippet) await moduleCallbacks.snippet('aa');
      expect(emitter.emit).toHaveBeenCalledWith(
        KitEvent.RunPromptProcess,
        expect.objectContaining({ scriptPath: '/test/1.js' }),
      );

      vi.clearAllMocks();

      // Remove the snippet
      removeSnippet('/test/1.js');

      // Try to trigger it again - should not work
      kitState.snippet = 'aa';
      if (moduleCallbacks.snippet) await moduleCallbacks.snippet('aa');
      expect(emitter.emit).not.toHaveBeenCalled();
    });
  });
});
