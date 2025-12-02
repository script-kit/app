import { describe, expect, it } from 'vitest';

describe('Snippet Prefix Indexing Logic', () => {
  // Recreate the indexing logic in isolation
  function buildSnippetPrefixIndex(snippetKeys: string[]): Map<string, string[]> {
    const index = new Map<string, string[]>();

    for (const key of snippetKeys) {
      const kl = key.length;
      // For snippets of 2 chars, index under 2-char prefix
      // For snippets of 3+ chars, index under 3-char prefix
      if (kl === 2) {
        // Store 2-char snippets under their full key
        let arr = index.get(key);
        if (!arr) {
          arr = [];
          index.set(key, arr);
        }
        arr.push(key);
      } else {
        // Store 3+ char snippets under their last 3 chars
        const prefix = key.slice(-3);
        let arr = index.get(prefix);
        if (!arr) {
          arr = [];
          index.set(prefix, arr);
        }
        arr.push(key);
      }
    }

    return index;
  }

  // Recreate the lookup logic
  function findMatchingSnippets(typedText: string, index: Map<string, string[]>): string[] {
    const sl = typedText.length;
    if (sl < 2) {
      return [];
    }

    // Check both 2-char and 3-char prefixes to find all possible snippet matches
    const prefixesToCheck: string[] = [];
    if (sl >= 2) {
      prefixesToCheck.push(typedText.slice(-2));
    }
    if (sl >= 3) {
      prefixesToCheck.push(typedText.slice(-3));
    }

    // Collect all potential snippet keys from all prefixes
    const potentialSnippetKeys = new Set<string>();
    for (const prefix of prefixesToCheck) {
      const keys = index.get(prefix);
      if (keys) {
        for (const key of keys) {
          potentialSnippetKeys.add(key);
        }
      }
    }

    // Check if the typed text ends with any of the snippet keys
    const matchingSnippets: string[] = [];
    for (const snippetKey of potentialSnippetKeys) {
      if (typedText.endsWith(snippetKey)) {
        matchingSnippets.push(snippetKey);
      }
    }

    return matchingSnippets;
  }

  describe('Index Building', () => {
    it('should index 2-character snippets under their full key', () => {
      const index = buildSnippetPrefixIndex([',,']);
      expect(index.has(',,')).toBe(true);
      expect(index.get(',,')).toEqual([',,']);
    });

    it('should index 3-character snippets under last 3 chars', () => {
      const index = buildSnippetPrefixIndex(['foo']);
      expect(index.has('foo')).toBe(true);
      expect(index.get('foo')).toEqual(['foo']);
    });

    it('should index longer snippets under last 3 chars', () => {
      const index = buildSnippetPrefixIndex(['test', 'hello']);
      expect(index.has('est')).toBe(true);
      expect(index.get('est')).toEqual(['test']);
      expect(index.has('llo')).toBe(true);
      expect(index.get('llo')).toEqual(['hello']);
    });

    it('should handle multiple snippets with same prefix', () => {
      const index = buildSnippetPrefixIndex(['best', 'test', 'nest']);
      expect(index.has('est')).toBe(true);
      expect(index.get('est')).toEqual(['best', 'test', 'nest']);
    });
  });

  describe('Snippet Lookup', () => {
    it('should find 2-character snippets', () => {
      const index = buildSnippetPrefixIndex([',,']);

      expect(findMatchingSnippets('hello,,', index)).toEqual([',,']);
      expect(findMatchingSnippets('world,,', index)).toEqual([',,']);
      expect(findMatchingSnippets(',,', index)).toEqual([',,']);
      expect(findMatchingSnippets('test,', index)).toEqual([]);
    });

    it('should find 3-character snippets', () => {
      const index = buildSnippetPrefixIndex(['foo']);

      expect(findMatchingSnippets('testfoo', index)).toEqual(['foo']);
      expect(findMatchingSnippets('foo', index)).toEqual(['foo']);
      expect(findMatchingSnippets('fo', index)).toEqual([]);
    });

    it('should find longer snippets', () => {
      const index = buildSnippetPrefixIndex(['test', 'hello']);

      expect(findMatchingSnippets('mytest', index)).toEqual(['test']);
      expect(findMatchingSnippets('sayhello', index)).toEqual(['hello']);
    });

    it('should handle overlapping snippets', () => {
      const index = buildSnippetPrefixIndex([',,', ',,,']);

      const matches1 = findMatchingSnippets('hello,,', index);
      expect(matches1).toContain(',,');
      expect(matches1).not.toContain(',,,');

      const matches2 = findMatchingSnippets('hello,,,', index);
      expect(matches2).toContain(',,');
      expect(matches2).toContain(',,,');
    });

    it('should not match partial snippets', () => {
      const index = buildSnippetPrefixIndex([',,', 'test']);

      expect(findMatchingSnippets('hello,', index)).toEqual([]);
      expect(findMatchingSnippets('tes', index)).toEqual([]);
    });

    it('should handle edge cases', () => {
      const index = buildSnippetPrefixIndex([',,', '@@', '!!!']);

      expect(findMatchingSnippets('', index)).toEqual([]);
      expect(findMatchingSnippets('a', index)).toEqual([]);
      expect(findMatchingSnippets('@@', index)).toEqual(['@@']);
      expect(findMatchingSnippets('wow!!!', index)).toEqual(['!!!']);
    });
  });

  describe('Real-world Scenarios', () => {
    it('should support the find-synonym use case', () => {
      const index = buildSnippetPrefixIndex([',,']);

      // User types various words followed by ,,
      const testCases = [
        'wonder,,',
        'amazing,,',
        'hello,,',
        'test,,',
        'a,,', // Even single char before trigger
        ',,', // Just the trigger itself
      ];

      for (const testCase of testCases) {
        const matches = findMatchingSnippets(testCase, index);
        expect(matches).toEqual([',,'], `Failed for: ${testCase}`);
      }
    });

    it('should handle mixed snippet lengths', () => {
      const index = buildSnippetPrefixIndex([
        '!!', // 2 chars
        'cmd', // 3 chars
        'test', // 4 chars
        'snippet', // 7 chars
      ]);

      expect(findMatchingSnippets('wow!!', index)).toEqual(['!!']);
      expect(findMatchingSnippets('runcmd', index)).toEqual(['cmd']);
      expect(findMatchingSnippets('mytest', index)).toEqual(['test']);
      expect(findMatchingSnippets('longsnippet', index)).toEqual(['snippet']);
    });
  });
});
