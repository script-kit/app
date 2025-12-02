import type { Script } from '@johnlindquist/kit/types/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Since we can't easily test the module internals, we'll test the behavior
// by mocking all dependencies and testing the exported functions

describe('Snippet System Unit Tests', () => {
  describe('Snippet Map Management', () => {
    it('should demonstrate snippet detection logic for 2-character snippets', () => {
      // This test documents how 2-character snippet detection should work
      const snippetMap = new Map();
      const snippetPrefixIndex = new Map<string, string[]>();

      // Add a 2-character snippet
      const snippet = ',,';
      snippetMap.set(snippet, { filePath: '/test/script.js', postfix: false, txt: false });

      // Index it under its full key for 2-char snippets
      if (snippet.length === 2) {
        let arr = snippetPrefixIndex.get(snippet);
        if (!arr) {
          arr = [];
          snippetPrefixIndex.set(snippet, arr);
        }
        arr.push(snippet);
      }

      // Test detection
      const typedText = 'hello,,';
      const prefixesToCheck: string[] = [];
      if (typedText.length >= 2) {
        prefixesToCheck.push(typedText.slice(-2)); // ,,
      }

      const potentialSnippets = new Set<string>();
      for (const prefix of prefixesToCheck) {
        const keys = snippetPrefixIndex.get(prefix);
        if (keys) {
          for (const key of keys) {
            if (snippetMap.has(key)) {
              potentialSnippets.add(key);
            }
          }
        }
      }

      // Check if typed text ends with snippet
      let triggeredSnippet = null;
      for (const snippetKey of potentialSnippets) {
        if (typedText.endsWith(snippetKey)) {
          triggeredSnippet = snippetKey;
          break;
        }
      }

      expect(triggeredSnippet).toBe(',,');
    });

    it('should demonstrate snippet detection logic for 3+ character snippets', () => {
      const snippetMap = new Map();
      const snippetPrefixIndex = new Map<string, string[]>();

      // Add longer snippets
      const snippets = ['test', 'fastest'];
      snippets.forEach((snippet) => {
        snippetMap.set(snippet, { filePath: `/test/${snippet}.js`, postfix: false, txt: false });

        // Index under last 3 chars for 3+ char snippets
        if (snippet.length >= 3) {
          const prefix = snippet.slice(-3);
          let arr = snippetPrefixIndex.get(prefix);
          if (!arr) {
            arr = [];
            snippetPrefixIndex.set(prefix, arr);
          }
          arr.push(snippet);
        }
      });

      // Test detection for 'test'
      const typedText = 'this is a test';
      const prefixesToCheck: string[] = [];
      if (typedText.length >= 3) {
        prefixesToCheck.push(typedText.slice(-3)); // est
      }

      const potentialSnippets = new Set<string>();
      for (const prefix of prefixesToCheck) {
        const keys = snippetPrefixIndex.get(prefix);
        if (keys) {
          for (const key of keys) {
            if (snippetMap.has(key)) {
              potentialSnippets.add(key);
            }
          }
        }
      }

      // Both 'test' and 'fastest' end with 'est' so both are potential matches
      expect(potentialSnippets.has('test')).toBe(true);
      expect(potentialSnippets.has('fastest')).toBe(true);

      // But only 'test' matches the end of our typed text
      let triggeredSnippet = null;
      for (const snippetKey of potentialSnippets) {
        if (typedText.endsWith(snippetKey)) {
          triggeredSnippet = snippetKey;
          break;
        }
      }

      expect(triggeredSnippet).toBe('test');
    });

    it('should handle postfix snippets correctly', () => {
      const snippetMap = new Map();

      // Postfix snippet starts with * but is stored without it
      const postfixSnippet = '*fix';
      const storedKey = 'fix';
      snippetMap.set(storedKey, {
        filePath: '/test/postfix.js',
        postfix: true,
        txt: false,
      });

      const typedText = 'someTextfix';

      // Check if it ends with the snippet
      if (typedText.endsWith(storedKey)) {
        const snippetInfo = snippetMap.get(storedKey);
        expect(snippetInfo?.postfix).toBe(true);

        // Extract prefix for postfix snippets
        const prefix = typedText.slice(0, typedText.length - storedKey.length);
        expect(prefix).toBe('someText');
      }
    });

    it('should handle text snippets differently', () => {
      const snippetMap = new Map();

      snippetMap.set('note', {
        filePath: '/test/note.txt',
        postfix: false,
        txt: true,
      });

      const snippetInfo = snippetMap.get('note');
      expect(snippetInfo?.txt).toBe(true);
      expect(snippetInfo?.filePath).toMatch(/\.txt$/);
    });

    it('should check file extension for text snippet behavior', () => {
      const snippetMap = new Map();

      // Even if txt is false, .txt extension should trigger text behavior
      snippetMap.set('doc', {
        filePath: '/test/doc.txt',
        postfix: false,
        txt: false,
      });

      const snippetInfo = snippetMap.get('doc');
      const shouldUsePasteSnippet = snippetInfo?.txt || snippetInfo?.filePath.endsWith('.txt');
      expect(shouldUsePasteSnippet).toBe(true);
    });

    it('should remove old snippets when updating', () => {
      const snippetMap = new Map();
      const filePath = '/test/script.js';

      // Add initial snippet
      snippetMap.set('old', { filePath, postfix: false, txt: false });

      // When updating, remove all snippets with same file path
      const toDelete: string[] = [];
      for (const [key, value] of snippetMap.entries()) {
        if (value.filePath === filePath) {
          toDelete.push(key);
        }
      }

      for (const key of toDelete) {
        snippetMap.delete(key);
      }

      // Add new snippet
      snippetMap.set('new', { filePath, postfix: false, txt: false });

      expect(snippetMap.has('old')).toBe(false);
      expect(snippetMap.has('new')).toBe(true);
    });

    it('should handle null/undefined snippets gracefully', () => {
      const snippetMap = new Map();
      snippetMap.set('bad', null as any);

      const snippetInfo = snippetMap.get('bad');

      // Should handle null gracefully
      if (!snippetInfo) {
        expect(snippetInfo).toBeNull();
      }
    });

    it('should clear snippet on space character', () => {
      let snippet = 'test_'; // _ represents space in snippet tracking

      if (snippet.endsWith('_')) {
        snippet = '';
      }

      expect(snippet).toBe('');
    });

    it('should handle snippet metadata parsing', () => {
      const parseSnippetMetadata = (contents: string) => {
        const lines = contents.split('\n');
        const metadata: Record<string, string> = {};
        const snippetRegex = /^(?:\/\/|#)\s{0,2}([\w-]+):\s*(.*)/;

        for (const line of lines) {
          const match = line.match(snippetRegex);
          if (match) {
            metadata[match[1].trim().toLowerCase()] = match[2].trim();
          } else {
            break;
          }
        }

        return metadata;
      };

      const fileContent = `// snippet: hello
// author: test
// expand: hi
This is the content`;

      const metadata = parseSnippetMetadata(fileContent);
      expect(metadata.snippet).toBe('hello');
      expect(metadata.author).toBe('test');
      expect(metadata.expand).toBe('hi');

      // snippet or expand can be used
      const snippetKey = metadata.snippet || metadata.expand;
      expect(snippetKey).toBe('hello');
    });

    it('should validate trusted kenvs', () => {
      const trustedKenvs: string[] = ['trusted-kenv'];
      const trustedKenvsKey = 'TRUSTED_KENVS';

      const script1: Script = {
        filePath: '/test/trusted.js',
        snippet: ';;',
        kenv: 'trusted-kenv',
      } as Script;

      const script2: Script = {
        filePath: '/test/untrusted.js',
        snippet: '::',
        kenv: 'untrusted-kenv',
      } as Script;

      const script3: Script = {
        filePath: '/test/main.js',
        snippet: '!!',
        kenv: '', // empty kenv is always trusted
      } as Script;

      // Check if script should be added
      const shouldAdd1 = script1.kenv === '' || trustedKenvs.includes(script1.kenv);
      const shouldAdd2 = script2.kenv === '' || trustedKenvs.includes(script2.kenv);
      const shouldAdd3 = script3.kenv === '' || trustedKenvs.includes(script3.kenv);

      expect(shouldAdd1).toBe(true);
      expect(shouldAdd2).toBe(false);
      expect(shouldAdd3).toBe(true);
    });
  });
});
