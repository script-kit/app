import { describe, it, expect, beforeEach } from 'vitest';

// Simulated integration test for snippet workflows
describe('Snippet Integration Workflow', () => {
  // Mock snippet map and operations
  const snippetMap = new Map<string, { filePath: string; postfix: boolean; txt: boolean }>();
  const prefixIndex = new Map<string, string[]>();
  
  function updatePrefixIndex() {
    prefixIndex.clear();
    for (const [key] of snippetMap) {
      if (key.length === 2) {
        let arr = prefixIndex.get(key);
        if (!arr) {
          arr = [];
          prefixIndex.set(key, arr);
        }
        arr.push(key);
      } else if (key.length >= 3) {
        const prefix = key.slice(-3);
        let arr = prefixIndex.get(prefix);
        if (!arr) {
          arr = [];
          prefixIndex.set(prefix, arr);
        }
        arr.push(key);
      }
    }
  }
  
  function addSnippet(trigger: string, filePath: string, postfix = false, txt = true) {
    // Remove existing snippets from same file
    const toDelete: string[] = [];
    for (const [key, val] of snippetMap.entries()) {
      if (val.filePath === filePath) {
        toDelete.push(key);
      }
    }
    toDelete.forEach(k => snippetMap.delete(k));
    
    // Handle postfix marker
    const actualTrigger = trigger.startsWith('*') ? trigger.slice(1) : trigger;
    const isPostfix = trigger.startsWith('*') || postfix;
    
    snippetMap.set(actualTrigger, { filePath, postfix: isPostfix, txt });
    updatePrefixIndex();
  }
  
  function removeSnippetsByPath(filePath: string) {
    const toDelete: string[] = [];
    for (const [key, val] of snippetMap.entries()) {
      if (val.filePath === filePath) {
        toDelete.push(key);
      }
    }
    toDelete.forEach(k => snippetMap.delete(k));
    updatePrefixIndex();
  }
  
  function findSnippetsEndingWith(text: string): string[] {
    const matches: string[] = [];
    
    // Check 2-char snippets
    if (text.length >= 2) {
      const twoCharKey = text.slice(-2);
      const twoCharSnippets = prefixIndex.get(twoCharKey) || [];
      for (const key of twoCharSnippets) {
        if (text.endsWith(key) && key.length === 2) {
          matches.push(key);
        }
      }
    }
    
    // Check 3+ char snippets
    if (text.length >= 3) {
      const threeCharPrefix = text.slice(-3);
      const threeCharSnippets = prefixIndex.get(threeCharPrefix) || [];
      for (const key of threeCharSnippets) {
        if (text.endsWith(key)) {
          matches.push(key);
        }
      }
    }
    
    return matches;
  }
  
  beforeEach(() => {
    snippetMap.clear();
    prefixIndex.clear();
  });
  
  describe('Text snippet workflow', () => {
    it('should handle complete text snippet lifecycle', () => {
      const filePath = '/test/snippets/hello.txt';
      
      // 1. Add text snippet
      addSnippet('hello', filePath, false, true);
      expect(snippetMap.has('hello')).toBe(true);
      expect(snippetMap.get('hello')?.txt).toBe(true);
      
      // 2. Check prefix index
      const matches = findSnippetsEndingWith('say hello');
      expect(matches).toContain('hello');
      
      // 3. Update snippet trigger
      addSnippet('hi', filePath, false, true);
      expect(snippetMap.has('hello')).toBe(false);
      expect(snippetMap.has('hi')).toBe(true);
      
      // 4. Remove snippet
      removeSnippetsByPath(filePath);
      expect(snippetMap.size).toBe(0);
    });
    
    it('should handle postfix snippets correctly', () => {
      const filePath = '/test/snippets/postfix.txt';
      
      // Add postfix snippet with asterisk
      addSnippet('*log', filePath);
      
      // Should store without asterisk
      expect(snippetMap.has('log')).toBe(true);
      expect(snippetMap.has('*log')).toBe(false);
      expect(snippetMap.get('log')?.postfix).toBe(true);
      
      // Should match when typing
      const matches = findSnippetsEndingWith('console.log');
      expect(matches).toContain('log');
    });
    
    it('should handle 2-character snippets', () => {
      const filePath = '/test/snippets/comma.txt';
      
      addSnippet(',,', filePath);
      
      // Check it's indexed correctly
      expect(prefixIndex.has(',,')).toBe(true);
      
      // Should match exact 2-char ending
      expect(findSnippetsEndingWith('type,,')).toContain(',,');
      expect(findSnippetsEndingWith(',')).not.toContain(',,');
    });
  });
  
  describe('Multiple snippet management', () => {
    it('should handle multiple snippets without conflicts', () => {
      // Add multiple snippets
      addSnippet('hello', '/test/hello.txt');
      addSnippet('help', '/test/help.txt');
      addSnippet('hell', '/test/hell.txt');
      
      expect(snippetMap.size).toBe(3);
      
      // Check they all match correctly
      expect(findSnippetsEndingWith('hello')).toContain('hello');
      expect(findSnippetsEndingWith('help')).toContain('help');
      expect(findSnippetsEndingWith('hell')).toContain('hell');
      
      // Check prefix matching
      const elpMatches = findSnippetsEndingWith('need help');
      expect(elpMatches).toContain('help');
      expect(elpMatches).not.toContain('hello');
    });
    
    it('should handle snippet conflicts (same trigger, different files)', () => {
      const file1 = '/test/file1.txt';
      const file2 = '/test/file2.txt';
      
      addSnippet('test', file1);
      expect(snippetMap.get('test')?.filePath).toBe(file1);
      
      // Second file with same trigger should override
      addSnippet('test', file2);
      expect(snippetMap.get('test')?.filePath).toBe(file2);
      expect(snippetMap.size).toBe(1);
    });
  });
  
  describe('Edge cases', () => {
    it('should handle snippets with special characters', () => {
      const triggers = ['@@', '!!', '-->', '...', '[]'];
      
      triggers.forEach((trigger, i) => {
        addSnippet(trigger, `/test/special${i}.txt`);
      });
      
      expect(snippetMap.size).toBe(triggers.length);
      
      // Check 2-char special snippets
      expect(findSnippetsEndingWith('type@@')).toContain('@@');
      expect(findSnippetsEndingWith('wow!!')).toContain('!!');
    });
    
    it('should handle very long snippets', () => {
      const longTrigger = 'verylongsnippettrigger';
      addSnippet(longTrigger, '/test/long.txt');
      
      // Should index by last 3 chars
      expect(prefixIndex.has('ger')).toBe(true);
      expect(findSnippetsEndingWith('type ' + longTrigger)).toContain(longTrigger);
    });
    
    it('should handle empty or whitespace triggers gracefully', () => {
      addSnippet('', '/test/empty.txt');
      addSnippet('  ', '/test/spaces.txt');
      
      // Empty string is allowed as a key
      expect(snippetMap.has('')).toBe(true);
      // Spaces are preserved
      expect(snippetMap.has('  ')).toBe(true);
    });
  });
  
  describe('Real-world scenarios', () => {
    it('should handle common code snippets', () => {
      // JavaScript snippets
      addSnippet('log', '/snippets/console-log.txt');
      addSnippet('fn', '/snippets/function.txt');
      addSnippet('arr', '/snippets/array.txt');
      
      // React snippets
      addSnippet('rfc', '/snippets/react-component.txt');
      addSnippet('use', '/snippets/use-state.txt');
      
      expect(snippetMap.size).toBe(5);
      
      // Test common typing patterns
      expect(findSnippetsEndingWith('console.log')).toContain('log');
      expect(findSnippetsEndingWith('const fn')).toContain('fn');
      expect(findSnippetsEndingWith('export default rfc')).toContain('rfc');
    });
    
    it('should handle snippet updates when file changes', () => {
      const filePath = '/snippets/dynamic.txt';
      
      // Initial snippet
      addSnippet('old', filePath);
      expect(findSnippetsEndingWith('type old')).toContain('old');
      
      // File changes, new snippet trigger
      addSnippet('new', filePath);
      expect(findSnippetsEndingWith('type old')).not.toContain('old');
      expect(findSnippetsEndingWith('type new')).toContain('new');
      
      // File changes to postfix
      addSnippet('*fix', filePath);
      expect(snippetMap.get('fix')?.postfix).toBe(true);
    });
  });
});