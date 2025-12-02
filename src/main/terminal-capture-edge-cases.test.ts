import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TermCapture } from './transcript-builder';
import { TranscriptBuilder } from './transcript-builder';

describe('Terminal Capture Edge Cases and Error Handling', () => {
  describe('TranscriptBuilder edge cases', () => {
    it('should handle empty input gracefully', () => {
      const tb = new TranscriptBuilder({
        mode: 'full',
        stripAnsi: true,
        tailLines: 100,
        sentinelStart: '<<START>>',
        sentinelEnd: '<<END>>',
      });

      tb.push('');
      tb.push('');
      tb.push('');

      expect(tb.result()).toBe('');
    });

    it('should handle null/undefined input safely', () => {
      const tb = new TranscriptBuilder({
        mode: 'full',
        stripAnsi: true,
        tailLines: 100,
        sentinelStart: '<<START>>',
        sentinelEnd: '<<END>>',
      });

      // TypeScript would prevent this, but testing runtime safety
      tb.push(null as any);
      tb.push(undefined as any);

      expect(() => tb.result()).not.toThrow();
    });

    it('should handle mixed line endings correctly', () => {
      const tb = new TranscriptBuilder({
        mode: 'full',
        stripAnsi: true,
        tailLines: 100,
        sentinelStart: '<<START>>',
        sentinelEnd: '<<END>>',
      });

      tb.push('Line 1\n'); // Unix
      tb.push('Line 2\r\n'); // Windows
      tb.push('Line 3\r'); // Old Mac
      tb.push('Line 4'); // No ending

      const result = tb.result();
      expect(result).toContain('Line 1');
      expect(result).toContain('Line 2');
      expect(result).toContain('Line 3');
      expect(result).toContain('Line 4');
    });

    it('should handle extremely long single lines', () => {
      const tb = new TranscriptBuilder({
        mode: 'full',
        stripAnsi: true,
        tailLines: 100,
        sentinelStart: '<<START>>',
        sentinelEnd: '<<END>>',
      });

      const longLine = 'x'.repeat(1000000); // 1MB line
      tb.push(longLine);

      const result = tb.result();
      expect(result).toBe(longLine);
    });

    it('should handle binary data in strings', () => {
      const tb = new TranscriptBuilder({
        mode: 'full',
        stripAnsi: false,
        tailLines: 100,
        sentinelStart: '<<START>>',
        sentinelEnd: '<<END>>',
      });

      // String with null bytes and control characters
      const binaryString = 'Hello\x00World\x01\x02\x03';
      tb.push(binaryString);

      const result = tb.result();
      expect(result).toBe(binaryString);
    });

    it('should handle Unicode and emoji correctly', () => {
      const tb = new TranscriptBuilder({
        mode: 'full',
        stripAnsi: true,
        tailLines: 100,
        sentinelStart: '<<START>>',
        sentinelEnd: '<<END>>',
      });

      const unicodeText = '你好世界 🌍 Γειά σου κόσμε 🚀';
      tb.push(unicodeText);

      const result = tb.result();
      expect(result).toBe(unicodeText);
    });
  });

  describe('Sentinel mode edge cases', () => {
    it('should handle sentinels that appear multiple times on same line', () => {
      const tb = new TranscriptBuilder({
        mode: 'sentinel',
        stripAnsi: true,
        tailLines: 100,
        sentinelStart: 'START',
        sentinelEnd: 'END',
      });

      tb.push('START START data END END\n');

      const result = tb.result();
      expect(result).toBe('');
    });

    it('should handle nested sentinels', () => {
      const tb = new TranscriptBuilder({
        mode: 'sentinel',
        stripAnsi: true,
        tailLines: 100,
        sentinelStart: 'BEGIN',
        sentinelEnd: 'END',
      });

      tb.push('BEGIN\n');
      tb.push('Outer\n');
      tb.push('BEGIN\n'); // Nested BEGIN is just text
      tb.push('Inner\n');
      tb.push('END\n'); // This ends the first block
      tb.push('Still outer\n'); // This is outside any block
      tb.push('END\n');

      const result = tb.result();
      // Our implementation stops at the first END, which is correct behavior
      expect(result).toBe('Outer\nInner\n');
    });

    it('should handle sentinels that are substrings of each other', () => {
      const tb = new TranscriptBuilder({
        mode: 'sentinel',
        stripAnsi: true,
        tailLines: 100,
        sentinelStart: 'START',
        sentinelEnd: 'START_END',
      });

      tb.push('START\n');
      tb.push('Content\n');
      tb.push('START_END\n');

      const result = tb.result();
      expect(result).toBe('Content\n');
    });

    it('should handle sentinels with special regex characters', () => {
      const tb = new TranscriptBuilder({
        mode: 'sentinel',
        stripAnsi: true,
        tailLines: 100,
        sentinelStart: '<<<$[START]^>>>',
        sentinelEnd: '<<<$[END]^>>>',
      });

      tb.push('<<<$[START]^>>>\n');
      tb.push('Special chars content\n');
      tb.push('<<<$[END]^>>>\n');

      const result = tb.result();
      expect(result).toBe('Special chars content\n');
    });

    it('should handle unclosed sentinel blocks', () => {
      const tb = new TranscriptBuilder({
        mode: 'sentinel',
        stripAnsi: true,
        tailLines: 100,
        sentinelStart: 'START',
        sentinelEnd: 'END',
      });

      tb.push('START\n');
      tb.push('Content without end\n');
      tb.push('More content\n');
      // No END marker

      const result = tb.result();
      expect(result).toBe('Content without end\nMore content\n');
    });
  });

  describe('Tail mode edge cases', () => {
    it('should handle tail size of 0', () => {
      const tb = new TranscriptBuilder({
        mode: 'tail',
        stripAnsi: true,
        tailLines: 0,
        sentinelStart: '<<START>>',
        sentinelEnd: '<<END>>',
      });

      tb.push('Line 1\n');
      tb.push('Line 2\n');

      const result = tb.result();
      expect(result).toBe('');
    });

    it('should handle tail size of 1', () => {
      const tb = new TranscriptBuilder({
        mode: 'tail',
        stripAnsi: true,
        tailLines: 1,
        sentinelStart: '<<START>>',
        sentinelEnd: '<<END>>',
      });

      tb.push('Line 1\n');
      tb.push('Line 2\n');
      tb.push('Line 3\n');

      const result = tb.result();
      expect(result).toBe('Line 3\n');
    });

    it('should handle extremely large tail size', () => {
      const tb = new TranscriptBuilder({
        mode: 'tail',
        stripAnsi: true,
        tailLines: Number.MAX_SAFE_INTEGER,
        sentinelStart: '<<START>>',
        sentinelEnd: '<<END>>',
      });

      // Should not crash or use excessive memory
      for (let i = 0; i < 1000; i++) {
        tb.push(`Line ${i}\n`);
      }

      const result = tb.result();
      const lines = result.split('\n').filter((l) => l);
      expect(lines.length).toBe(1000);
    });
  });

  describe('ANSI stripping edge cases', () => {
    it('should strip valid ANSI sequences', () => {
      const tb = new TranscriptBuilder({
        mode: 'full',
        stripAnsi: true,
        tailLines: 100,
        sentinelStart: '<<START>>',
        sentinelEnd: '<<END>>',
      });

      // Valid ANSI sequences
      tb.push('\x1b[31mRed\x1b[0m \x1b[1mBold\x1b[0m \x1b[4mUnderline\x1b[0m');

      const result = tb.result();
      // All ANSI codes should be stripped
      expect(result).toBe('Red Bold Underline');
      expect(result).not.toContain('\x1b');
    });

    it('should handle ANSI sequences split across chunks', () => {
      const tb = new TranscriptBuilder({
        mode: 'full',
        stripAnsi: true,
        tailLines: 100,
        sentinelStart: '<<START>>',
        sentinelEnd: '<<END>>',
      });

      // Each chunk is processed independently
      tb.push('Normal \x1b');
      tb.push('[31m');
      tb.push('Red text\x1b[0m');

      const result = tb.result();
      // Since chunks are processed separately, partial ANSI codes may remain
      // The actual behavior depends on how ansi-regex handles edge cases
      expect(result).toContain('Normal');
      expect(result).toContain('Red text');
      expect(result).not.toContain('\x1b[0m'); // Complete sequences are stripped
    });

    it('should preserve ANSI when stripAnsi is false', () => {
      const tb = new TranscriptBuilder({
        mode: 'full',
        stripAnsi: false,
        tailLines: 100,
        sentinelStart: '<<START>>',
        sentinelEnd: '<<END>>',
      });

      const ansiText = '\x1b[1;31mBold Red\x1b[0m';
      tb.push(ansiText);

      const result = tb.result();
      expect(result).toBe(ansiText);
    });
  });

  describe('Mode switching and configuration edge cases', () => {
    it('should handle invalid mode gracefully', () => {
      const tb = new TranscriptBuilder({
        mode: 'invalid-mode' as any,
        stripAnsi: true,
        tailLines: 100,
        sentinelStart: '<<START>>',
        sentinelEnd: '<<END>>',
      });

      tb.push('Some text\n');

      // Should default to some safe behavior
      const result = tb.result();
      expect(result).toBeDefined();
    });

    it('should handle missing configuration properties', () => {
      const tb = new TranscriptBuilder({
        mode: 'sentinel',
        stripAnsi: true,
        tailLines: 100,
        sentinelStart: undefined as any,
        sentinelEnd: undefined as any,
      });

      tb.push('Some text\n');

      // Should not crash
      expect(() => tb.result()).not.toThrow();
    });
  });

  describe('Performance and memory edge cases', () => {
    it('should handle rapid small pushes efficiently', () => {
      const tb = new TranscriptBuilder({
        mode: 'full',
        stripAnsi: true,
        tailLines: 100,
        sentinelStart: '<<START>>',
        sentinelEnd: '<<END>>',
      });

      const startTime = Date.now();

      // Push 100,000 single characters
      for (let i = 0; i < 100000; i++) {
        tb.push('x');
      }

      const endTime = Date.now();
      const result = tb.result();

      expect(result.length).toBe(100000);
      expect(endTime - startTime).toBeLessThan(1000); // Should complete in < 1 second
    });

    it('should handle alternating modes efficiently', () => {
      // Test multiple TranscriptBuilders with different modes
      const builders = [
        new TranscriptBuilder({
          mode: 'full',
          stripAnsi: true,
          tailLines: 100,
          sentinelStart: '<<START>>',
          sentinelEnd: '<<END>>',
        }),
        new TranscriptBuilder({
          mode: 'tail',
          stripAnsi: true,
          tailLines: 10,
          sentinelStart: '<<START>>',
          sentinelEnd: '<<END>>',
        }),
        new TranscriptBuilder({
          mode: 'sentinel',
          stripAnsi: true,
          tailLines: 100,
          sentinelStart: 'BEGIN',
          sentinelEnd: 'END',
        }),
      ];

      // Push to all builders
      for (let i = 0; i < 1000; i++) {
        const line = `Line ${i}\n`;
        builders.forEach((tb) => tb.push(line));
      }

      // Each should produce different results based on mode
      const results = builders.map((tb) => tb.result());

      expect(results[0].split('\n').length).toBeGreaterThan(900); // Full mode
      // Tail mode - might have extra newlines due to how lines are joined
      const tailLines = results[1].split('\n').filter((l) => l.trim());
      expect(tailLines.length).toBeLessThanOrEqual(10); // Tail mode
      expect(results[2]).toBe(''); // Sentinel mode (no markers)
    });
  });

  describe('Concurrent access edge cases', () => {
    it('should handle concurrent push operations safely', () => {
      const tb = new TranscriptBuilder({
        mode: 'full',
        stripAnsi: true,
        tailLines: 100,
        sentinelStart: '<<START>>',
        sentinelEnd: '<<END>>',
      });

      // Simulate concurrent pushes (though JS is single-threaded)
      const promises = [];
      for (let i = 0; i < 100; i++) {
        promises.push(Promise.resolve().then(() => tb.push(`Concurrent ${i}\n`)));
      }

      return Promise.all(promises).then(() => {
        const result = tb.result();
        const lines = result.split('\n').filter((l) => l);
        expect(lines.length).toBe(100);
      });
    });
  });
});
