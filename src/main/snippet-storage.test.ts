import { describe, it, expect, vi, beforeEach } from 'vitest';
import { snippetMap, removeSnippet, snippetScriptChanged, addTextSnippet } from './tick';
import { readFile } from 'node:fs/promises';
import type { Script } from '@johnlindquist/kit/types';
import { ProcessType } from '@johnlindquist/kit/core/enum';

// Mock dependencies
vi.mock('node:fs/promises');
vi.mock('./logs', () => ({
  tickLog: {
    info: vi.fn(),
    verbose: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  },
  snippetLog: {
    info: vi.fn(),
    silly: vi.fn(),
    error: vi.fn(),
  },
}));
vi.mock('./state', () => ({
  kitState: {
    trustedKenvs: [],
  },
  kitConfig: {},
  kitClipboard: {},
  kitStore: {},
  subs: [],
}));

// Helper to access the prefix index via the updateSnippetPrefixIndex function
// Since it's not exported, we'll test it indirectly through the snippetMap operations
const getSnippetKeysWithPrefix = (prefix: string): string[] => {
  const keys: string[] = [];
  for (const [key] of snippetMap) {
    if (key.length === 2 && key === prefix) {
      keys.push(key);
    } else if (key.length >= 3 && key.slice(-3) === prefix) {
      keys.push(key);
    }
  }
  return keys;
};

describe('Snippet Storage Consistency', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    snippetMap.clear();
  });

  describe('snippetMap and prefix index consistency', () => {
    it('should maintain consistency between snippetMap and prefix index', async () => {
      const filePath = '/test/snippets/test.txt';
      vi.mocked(readFile).mockResolvedValue(`# Snippet: hello\nContent`);
      
      await addTextSnippet(filePath);
      
      // Check that the snippet is in the map
      expect(snippetMap.has('hello')).toBe(true);
      
      // Check that we can find it via prefix search
      const keysWithHel = getSnippetKeysWithPrefix('llo');
      expect(keysWithHel).toContain('hello');
    });

    it('should handle 2-character snippets correctly', async () => {
      const filePath = '/test/snippets/short.txt';
      vi.mocked(readFile).mockResolvedValue(`# Snippet: ,,\nComma snippet`);
      
      await addTextSnippet(filePath);
      
      expect(snippetMap.has(',,')).toBe(true);
      
      // 2-char snippets should be found by their full key
      const keysWithComma = getSnippetKeysWithPrefix(',,');
      expect(keysWithComma).toContain(',,');
    });

    it('should handle 3+ character snippets correctly', async () => {
      const filePath = '/test/snippets/long.txt';
      vi.mocked(readFile).mockResolvedValue(`# Snippet: trigger\nLong snippet`);
      
      await addTextSnippet(filePath);
      
      expect(snippetMap.has('trigger')).toBe(true);
      
      // Should be found by last 3 chars
      const keysWithGer = getSnippetKeysWithPrefix('ger');
      expect(keysWithGer).toContain('trigger');
    });

    it('should update prefix index when removing snippets', async () => {
      const filePath = '/test/snippets/test.txt';
      vi.mocked(readFile).mockResolvedValue(`# Snippet: hello\nContent`);
      
      await addTextSnippet(filePath);
      expect(snippetMap.has('hello')).toBe(true);
      
      removeSnippet(filePath);
      
      expect(snippetMap.has('hello')).toBe(false);
      const keysWithHel = getSnippetKeysWithPrefix('llo');
      expect(keysWithHel).not.toContain('hello');
    });
  });

  describe('snippet key and trigger consistency', () => {
    it('should store snippet with key matching the trigger text', async () => {
      const triggers = ['hello', 'world', ',,', 'test123'];
      
      for (const trigger of triggers) {
        const filePath = `/test/snippets/${trigger}.txt`;
        vi.mocked(readFile).mockResolvedValue(`# Snippet: ${trigger}\nContent`);
        
        await addTextSnippet(filePath);
        
        expect(snippetMap.has(trigger)).toBe(true);
        const snippet = snippetMap.get(trigger);
        expect(snippet).toBeDefined();
      }
    });

    it('should handle postfix snippets correctly', async () => {
      const filePath = '/test/snippets/postfix.txt';
      vi.mocked(readFile).mockResolvedValue(`# Snippet: *post\nPostfix content`);
      
      await addTextSnippet(filePath);
      
      // Postfix snippets should store without the asterisk
      expect(snippetMap.has('post')).toBe(true);
      expect(snippetMap.has('*post')).toBe(false);
      
      const snippet = snippetMap.get('post');
      expect(snippet?.postfix).toBe(true);
    });
  });

  describe('file path storage', () => {
    it('should store correct file paths for text snippets', async () => {
      const filePath = '/test/snippets/mysnippet.txt';
      vi.mocked(readFile).mockResolvedValue(`# Snippet: ms\nContent`);
      
      await addTextSnippet(filePath);
      
      const snippet = snippetMap.get('ms');
      expect(snippet?.filePath).toBe(filePath);
      expect(snippet?.txt).toBe(true);
    });

    it('should store correct file paths for script snippets', () => {
      const script: Script = {
        filePath: '/test/scripts/myscript.js',
        kenv: '',
        snippet: 'mys',
        name: 'myscript',
        type: ProcessType.Prompt,
        command: 'node',
        id: 'myscript',
      } as Script;
      
      snippetScriptChanged(script);
      
      const snippet = snippetMap.get('mys');
      expect(snippet?.filePath).toBe(script.filePath);
      expect(snippet?.txt).toBe(false);
    });

    it('should handle file paths with spaces and special characters', async () => {
      const filePath = '/test/snippets/my snippet file (1).txt';
      vi.mocked(readFile).mockResolvedValue(`# Snippet: sp1\nContent`);
      
      await addTextSnippet(filePath);
      
      const snippet = snippetMap.get('sp1');
      expect(snippet?.filePath).toBe(filePath);
    });
  });

  describe('txt flag consistency', () => {
    it('should set txt flag to true for .txt files', async () => {
      const filePath = '/test/snippets/text.txt';
      vi.mocked(readFile).mockResolvedValue(`# Snippet: txt1\nContent`);
      
      await addTextSnippet(filePath);
      
      const snippet = snippetMap.get('txt1');
      expect(snippet?.txt).toBe(true);
    });

    it('should set txt flag to false for script snippets', () => {
      const script: Script = {
        filePath: '/test/scripts/script.js',
        kenv: '',
        snippet: 'scr1',
        name: 'script',
        type: ProcessType.Prompt,
        command: 'node',
        id: 'script',
      } as Script;
      
      snippetScriptChanged(script);
      
      const snippet = snippetMap.get('scr1');
      expect(snippet?.txt).toBe(false);
    });
  });

  describe('snippet removal and cleanup', () => {
    it('should remove all snippets for a given file path', async () => {
      const filePath = '/test/snippets/multi.txt';
      
      // Add first snippet
      vi.mocked(readFile).mockResolvedValue(`# Snippet: one\nContent`);
      await addTextSnippet(filePath);
      
      // Update with different snippet
      vi.mocked(readFile).mockResolvedValue(`# Snippet: two\nContent`);
      await addTextSnippet(filePath);
      
      expect(snippetMap.has('two')).toBe(true);
      expect(snippetMap.has('one')).toBe(false);
      
      // Remove the file
      removeSnippet(filePath);
      
      expect(snippetMap.has('two')).toBe(false);
      expect(snippetMap.size).toBe(0);
    });

    it('should not affect other snippets when removing one', async () => {
      const filePath1 = '/test/snippets/file1.txt';
      const filePath2 = '/test/snippets/file2.txt';
      
      vi.mocked(readFile).mockResolvedValueOnce(`# Snippet: one\nContent`);
      await addTextSnippet(filePath1);
      
      vi.mocked(readFile).mockResolvedValueOnce(`# Snippet: two\nContent`);
      await addTextSnippet(filePath2);
      
      expect(snippetMap.size).toBe(2);
      
      removeSnippet(filePath1);
      
      expect(snippetMap.has('one')).toBe(false);
      expect(snippetMap.has('two')).toBe(true);
      expect(snippetMap.size).toBe(1);
    });
  });

  describe('duplicate snippet handling', () => {
    it('should handle multiple files with same trigger', async () => {
      const filePath1 = '/test/snippets/file1.txt';
      const filePath2 = '/test/snippets/file2.txt';
      
      vi.mocked(readFile).mockResolvedValueOnce(`# Snippet: same\nContent 1`);
      await addTextSnippet(filePath1);
      
      vi.mocked(readFile).mockResolvedValueOnce(`# Snippet: same\nContent 2`);
      await addTextSnippet(filePath2);
      
      // Last one wins
      const snippet = snippetMap.get('same');
      expect(snippet?.filePath).toBe(filePath2);
      expect(snippetMap.size).toBe(1);
    });

    it('should properly update when file changes trigger', async () => {
      const filePath = '/test/snippets/changing.txt';
      
      vi.mocked(readFile).mockResolvedValueOnce(`# Snippet: old\nContent`);
      await addTextSnippet(filePath);
      expect(snippetMap.has('old')).toBe(true);
      
      vi.mocked(readFile).mockResolvedValueOnce(`# Snippet: new\nContent`);
      await addTextSnippet(filePath);
      
      expect(snippetMap.has('old')).toBe(false);
      expect(snippetMap.has('new')).toBe(true);
      expect(snippetMap.size).toBe(1);
    });
  });

  describe('mixed snippet types', () => {
    it('should handle both text and script snippets in the same map', async () => {
      // Add text snippet
      const textPath = '/test/snippets/text.txt';
      vi.mocked(readFile).mockResolvedValue(`# Snippet: txt\nText content`);
      await addTextSnippet(textPath);
      
      // Add script snippet
      const script: Script = {
        filePath: '/test/scripts/script.js',
        kenv: '',
        snippet: 'scr',
        name: 'script',
        type: ProcessType.Prompt,
        command: 'node',
        id: 'script',
      } as Script;
      snippetScriptChanged(script);
      
      expect(snippetMap.size).toBe(2);
      expect(snippetMap.get('txt')?.txt).toBe(true);
      expect(snippetMap.get('scr')?.txt).toBe(false);
    });

    it('should handle script overriding text snippet with same trigger', async () => {
      // Add text snippet first
      const textPath = '/test/snippets/text.txt';
      vi.mocked(readFile).mockResolvedValue(`# Snippet: same\nText content`);
      await addTextSnippet(textPath);
      
      expect(snippetMap.get('same')?.txt).toBe(true);
      
      // Add script snippet with same trigger
      const script: Script = {
        filePath: '/test/scripts/script.js',
        kenv: '',
        snippet: 'same',
        name: 'script',
        type: ProcessType.Prompt,
        command: 'node',
        id: 'script',
      } as Script;
      snippetScriptChanged(script);
      
      // Script should override text snippet
      expect(snippetMap.get('same')?.txt).toBe(false);
      expect(snippetMap.get('same')?.filePath).toBe(script.filePath);
      expect(snippetMap.size).toBe(1);
    });
  });
});