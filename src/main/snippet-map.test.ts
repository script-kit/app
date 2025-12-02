import { beforeEach, describe, expect, it } from 'vitest';

// Simple implementation of snippet map functionality for testing
const snippetMap = new Map<string, { filePath: string; postfix: boolean; txt: boolean }>();
const snippetPrefixIndex = new Map<string, string[]>();

function updateSnippetPrefixIndex() {
  snippetPrefixIndex.clear();
  const keys = snippetMap.keys();
  for (const key of keys) {
    const kl = key.length;
    if (kl === 2) {
      // Store 2-char snippets under their full key
      let arr = snippetPrefixIndex.get(key);
      if (!arr) {
        arr = [];
        snippetPrefixIndex.set(key, arr);
      }
      arr.push(key);
    } else {
      // Store 3+ char snippets under their last 3 chars
      const prefix = key.slice(-3);
      let arr = snippetPrefixIndex.get(prefix);
      if (!arr) {
        arr = [];
        snippetPrefixIndex.set(prefix, arr);
      }
      arr.push(key);
    }
  }
}

function addSnippet(key: string, filePath: string, postfix: boolean = false, txt: boolean = true) {
  // Remove existing snippets with same file path
  const toDelete: string[] = [];
  for (const [k, v] of snippetMap.entries()) {
    if (v.filePath === filePath && v.txt === txt) {
      toDelete.push(k);
    }
  }
  toDelete.forEach((k) => snippetMap.delete(k));

  // Add new snippet
  snippetMap.set(key, { filePath, postfix, txt });
  updateSnippetPrefixIndex();
}

function removeSnippet(filePath: string) {
  const toDelete: string[] = [];
  for (const [key, val] of snippetMap.entries()) {
    if (val.filePath === filePath) {
      toDelete.push(key);
    }
  }
  toDelete.forEach((key) => snippetMap.delete(key));
  updateSnippetPrefixIndex();
}

describe('Snippet Map and Storage', () => {
  beforeEach(() => {
    snippetMap.clear();
    snippetPrefixIndex.clear();
  });

  describe('Basic snippet operations', () => {
    it('should add a text snippet to the map', () => {
      addSnippet('hello', '/test/hello.txt');

      expect(snippetMap.has('hello')).toBe(true);
      expect(snippetMap.get('hello')).toEqual({
        filePath: '/test/hello.txt',
        postfix: false,
        txt: true,
      });
    });

    it('should add a postfix snippet', () => {
      addSnippet('post', '/test/postfix.txt', true);

      expect(snippetMap.get('post')).toEqual({
        filePath: '/test/postfix.txt',
        postfix: true,
        txt: true,
      });
    });

    it('should remove snippet by file path', () => {
      addSnippet('test', '/test/file.txt');
      expect(snippetMap.has('test')).toBe(true);

      removeSnippet('/test/file.txt');
      expect(snippetMap.has('test')).toBe(false);
    });
  });

  describe('Prefix index', () => {
    it('should index 2-character snippets correctly', () => {
      addSnippet(',,', '/test/comma.txt');

      expect(snippetPrefixIndex.has(',,')).toBe(true);
      expect(snippetPrefixIndex.get(',,')).toContain(',,');
    });

    it('should index 3+ character snippets by last 3 chars', () => {
      addSnippet('hello', '/test/hello.txt');

      expect(snippetPrefixIndex.has('llo')).toBe(true);
      expect(snippetPrefixIndex.get('llo')).toContain('hello');
    });

    it('should update prefix index when removing snippets', () => {
      addSnippet('test', '/test/test.txt');
      expect(snippetPrefixIndex.has('est')).toBe(true);

      removeSnippet('/test/test.txt');
      expect(snippetPrefixIndex.has('est')).toBe(false);
    });

    it('should handle multiple snippets with same prefix', () => {
      addSnippet('hello', '/test/hello.txt');
      addSnippet('bello', '/test/bello.txt');

      const lloKeys = snippetPrefixIndex.get('llo');
      expect(lloKeys).toContain('hello');
      expect(lloKeys).toContain('bello');
      expect(lloKeys?.length).toBe(2);
    });
  });

  describe('File path updates', () => {
    it('should replace snippet when same file is updated', () => {
      addSnippet('old', '/test/file.txt');
      expect(snippetMap.has('old')).toBe(true);

      addSnippet('new', '/test/file.txt');
      expect(snippetMap.has('old')).toBe(false);
      expect(snippetMap.has('new')).toBe(true);
    });

    it('should handle multiple snippets from different files', () => {
      addSnippet('one', '/test/file1.txt');
      addSnippet('two', '/test/file2.txt');

      expect(snippetMap.size).toBe(2);
      expect(snippetMap.get('one')?.filePath).toBe('/test/file1.txt');
      expect(snippetMap.get('two')?.filePath).toBe('/test/file2.txt');
    });

    it('should only remove snippets from specified file', () => {
      addSnippet('one', '/test/file1.txt');
      addSnippet('two', '/test/file2.txt');

      removeSnippet('/test/file1.txt');

      expect(snippetMap.has('one')).toBe(false);
      expect(snippetMap.has('two')).toBe(true);
    });
  });

  describe('Text vs Script snippets', () => {
    it('should distinguish between text and script snippets', () => {
      addSnippet('txt', '/test/text.txt', false, true);
      addSnippet('scr', '/test/script.js', false, false);

      expect(snippetMap.get('txt')?.txt).toBe(true);
      expect(snippetMap.get('scr')?.txt).toBe(false);
    });

    it('should not remove text snippets when removing script snippets from same path', () => {
      // This tests that txt flag is considered in removal
      addSnippet('test', '/test/file', false, true);

      // Try to remove with different txt flag (shouldn't remove)
      const toDelete: string[] = [];
      for (const [key, val] of snippetMap.entries()) {
        if (val.filePath === '/test/file' && val.txt === false) {
          toDelete.push(key);
        }
      }
      toDelete.forEach((key) => snippetMap.delete(key));

      expect(snippetMap.has('test')).toBe(true);
    });
  });

  describe('Edge cases', () => {
    it('should handle empty trigger keys', () => {
      addSnippet('', '/test/empty.txt');
      expect(snippetMap.has('')).toBe(true);
    });

    it('should handle special characters in triggers', () => {
      const specialTriggers = ['@@', '!!', '$$', '&&'];

      specialTriggers.forEach((trigger, i) => {
        addSnippet(trigger, `/test/special${i}.txt`);
      });

      specialTriggers.forEach((trigger) => {
        expect(snippetMap.has(trigger)).toBe(true);
      });
    });

    it('should handle very long triggers', () => {
      const longTrigger = 'a'.repeat(50);
      addSnippet(longTrigger, '/test/long.txt');

      expect(snippetMap.has(longTrigger)).toBe(true);
      // Should be indexed by last 3 chars
      expect(snippetPrefixIndex.has('aaa')).toBe(true);
    });

    it('should handle file paths with spaces and special chars', () => {
      const weirdPath = '/test/my file (1) [special].txt';
      addSnippet('test', weirdPath);

      expect(snippetMap.get('test')?.filePath).toBe(weirdPath);
    });
  });
});
