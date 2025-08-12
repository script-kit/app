import { describe, it, expect, beforeEach } from 'vitest';
import { normalizeWithMap, remapRange } from './normalize-map';

describe('normalize-map', () => {
  beforeEach(() => {
    // Clear the cache by creating a new instance
    // Note: In a real implementation, you might want to expose a clear method
  });

  describe('normalizeWithMap', () => {
    it('should normalize strings by removing hyphens and lowercasing (preserving spaces)', () => {
      expect(normalizeWithMap('kit-container')).toBe('kitcontainer');
      expect(normalizeWithMap('Kit Container')).toBe('kit container');
      expect(normalizeWithMap('KIT-CONTAINER')).toBe('kitcontainer');
      expect(normalizeWithMap('kit - container')).toBe('kit  container');
    });

    it('should cache normalized strings', () => {
      const str = 'test-string';
      const result1 = normalizeWithMap(str);
      const result2 = normalizeWithMap(str);
      
      expect(result1).toBe(result2);
      expect(result1).toBe('teststring');
    });

    it('should handle empty strings', () => {
      expect(normalizeWithMap('')).toBe('');
    });

    it('should handle strings with only hyphens and spaces', () => {
      expect(normalizeWithMap('- - -')).toBe('  ');  // Results in 2 spaces after removing 3 hyphens
      expect(normalizeWithMap('   ')).toBe('   ');   // Spaces are preserved
    });

    it('should preserve other special characters', () => {
      expect(normalizeWithMap('test_string@123')).toBe('test_string@123');
      expect(normalizeWithMap('file.name.js')).toBe('file.name.js');
    });
  });

  describe('remapRange', () => {
    it('should remap ranges correctly for hyphenated words', () => {
      const raw = 'kit-container';
      normalizeWithMap(raw); // Populate cache
      
      // 'kitcontainer' matches:
      // [0, 3] (kit) should map to [0, 3] (kit)
      // [3, 12] (container) should map to [4, 13] (-container)
      expect(remapRange(raw, [0, 3])).toEqual([0, 3]);
      expect(remapRange(raw, [3, 12])).toEqual([4, 13]);
    });

    it('should remap ranges correctly for spaced words', () => {
      const raw = 'kit container';
      normalizeWithMap(raw); // Populate cache
      
      // 'kit container' (space preserved) matches:
      // [0, 3] (kit) should map to [0, 3] (kit)
      // [4, 13] (container) should map to [4, 13] (container - same since space is preserved)
      expect(remapRange(raw, [0, 3])).toEqual([0, 3]);
      expect(remapRange(raw, [4, 13])).toEqual([4, 13]);
    });

    it('should remap ranges correctly for multiple hyphens', () => {
      const raw = 'test-multi-word-string';
      normalizeWithMap(raw); // Populate cache
      
      // 'testmultiwordstring' matches:
      // [0, 4] (test) should map to [0, 4] (test)
      // [4, 9] (multi) should map to [5, 10] (-multi)
      // [9, 13] (word) should map to [11, 15] (-word)
      // [13, 19] (string) should map to [16, 22] (-string)
      expect(remapRange(raw, [0, 4])).toEqual([0, 4]);
      expect(remapRange(raw, [4, 9])).toEqual([5, 10]);
      expect(remapRange(raw, [9, 13])).toEqual([11, 15]);
      expect(remapRange(raw, [13, 19])).toEqual([16, 22]);
    });

    it('should handle single character matches', () => {
      const raw = 'a-b-c';
      normalizeWithMap(raw); // Populate cache
      
      // 'abc' matches:
      // [0, 1] (a) should map to [0, 1] (a)
      // [1, 2] (b) should map to [2, 3] (-b)
      // [2, 3] (c) should map to [4, 5] (-c)
      expect(remapRange(raw, [0, 1])).toEqual([0, 1]);
      expect(remapRange(raw, [1, 2])).toEqual([2, 3]);
      expect(remapRange(raw, [2, 3])).toEqual([4, 5]);
    });

    it('should handle full string matches', () => {
      const raw = 'kit-container';
      normalizeWithMap(raw); // Populate cache
      
      // Full match [0, 12] should map to [0, 13]
      expect(remapRange(raw, [0, 12])).toEqual([0, 13]);
    });

    it('should return original range if string not in cache', () => {
      // Don't normalize first
      expect(remapRange('uncached-string', [0, 5])).toEqual([0, 5]);
    });

    it('should handle empty ranges', () => {
      const raw = 'test-string';
      normalizeWithMap(raw); // Populate cache
      
      expect(remapRange(raw, [0, 0])).toEqual([0, 1]); // Empty range becomes single char
    });

    it('should handle uppercase in original string', () => {
      const raw = 'Kit-Container';
      normalizeWithMap(raw); // Populate cache
      
      // 'kitcontainer' matches should map correctly to original positions
      expect(remapRange(raw, [0, 3])).toEqual([0, 3]);
      expect(remapRange(raw, [3, 12])).toEqual([4, 13]);
    });
  });

  describe('integration scenarios', () => {
    it('should handle complex real-world examples', () => {
      const testCases = [
        {
          raw: 'run-script-in-background',
          normalized: 'runscriptinbackground',
          ranges: [
            { input: [0, 3], expected: [0, 3] },    // run
            { input: [3, 9], expected: [4, 10] },   // script
            { input: [9, 11], expected: [11, 13] }, // in
            { input: [11, 21], expected: [14, 24] } // background
          ]
        },
        {
          raw: 'VS Code Extension',
          normalized: 'vs code extension',  // Spaces are preserved
          ranges: [
            { input: [0, 2], expected: [0, 2] },     // VS
            { input: [3, 7], expected: [3, 7] },     // Code (no change, space preserved)
            { input: [8, 17], expected: [8, 17] }    // Extension (no change, space preserved)
          ]
        }
      ];

      for (const testCase of testCases) {
        const normalized = normalizeWithMap(testCase.raw);
        expect(normalized).toBe(testCase.normalized);
        
        for (const range of testCase.ranges) {
          expect(remapRange(testCase.raw, range.input as [number, number]))
            .toEqual(range.expected);
        }
      }
    });
  });
});