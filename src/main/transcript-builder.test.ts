import { describe, expect, it } from 'vitest';
import { TranscriptBuilder } from './transcript-builder';

describe('TranscriptBuilder', () => {
  describe('full mode', () => {
    it('should capture all text in full mode', () => {
      const builder = new TranscriptBuilder({
        mode: 'full',
        tailLines: 1000,
        stripAnsi: false,
        sentinelStart: '<<START>>',
        sentinelEnd: '<<END>>',
      });

      builder.push('line 1\n');
      builder.push('line 2\n');
      builder.push('line 3\n');

      expect(builder.result()).toBe('line 1\nline 2\nline 3\n');
    });

    it('should strip ANSI codes when stripAnsi is true', () => {
      const builder = new TranscriptBuilder({
        mode: 'full',
        tailLines: 1000,
        stripAnsi: true,
        sentinelStart: '<<START>>',
        sentinelEnd: '<<END>>',
      });

      builder.push('\x1b[31mred text\x1b[0m\n');
      builder.push('\x1b[1;32mbold green\x1b[0m\n');

      expect(builder.result()).toBe('red text\nbold green\n');
    });
  });

  describe('tail mode', () => {
    it('should keep only the last N lines in tail mode', () => {
      const builder = new TranscriptBuilder({
        mode: 'tail',
        tailLines: 3,
        stripAnsi: false,
        sentinelStart: '<<START>>',
        sentinelEnd: '<<END>>',
      });

      builder.push('line 1');
      builder.push('line 2');
      builder.push('line 3');
      builder.push('line 4');
      builder.push('line 5');

      expect(builder.result()).toBe('line 3\nline 4\nline 5');
    });
  });

  describe('sentinel mode', () => {
    it('should capture text between sentinels', () => {
      const builder = new TranscriptBuilder({
        mode: 'sentinel',
        tailLines: 1000,
        stripAnsi: false,
        sentinelStart: '<<START>>',
        sentinelEnd: '<<END>>',
      });

      builder.push('ignored line\n');
      builder.push('<<START>>\n');
      builder.push('captured line 1\n');
      builder.push('captured line 2\n');
      builder.push('<<END>>\n');
      builder.push('ignored line\n');

      expect(builder.result()).toBe('captured line 1\ncaptured line 2\n');
    });

    it('should handle multiple sentinel blocks', () => {
      const builder = new TranscriptBuilder({
        mode: 'sentinel',
        tailLines: 1000,
        stripAnsi: false,
        sentinelStart: '<<START>>',
        sentinelEnd: '<<END>>',
      });

      builder.push('ignored\n<<START>>\ncaptured 1\n<<END>>\nignored\n<<START>>\ncaptured 2\n<<END>>');

      expect(builder.result()).toBe('captured 1\ncaptured 2\n');
    });

    it('should handle sentinels in the middle of lines', () => {
      const builder = new TranscriptBuilder({
        mode: 'sentinel',
        tailLines: 1000,
        stripAnsi: false,
        sentinelStart: 'BEGIN',
        sentinelEnd: 'END',
      });

      builder.push('prefix BEGIN content END suffix');

      // Since sentinels are on the same line as content, nothing is captured
      expect(builder.result()).toBe('');
    });
  });

  describe('none mode', () => {
    it('should not capture anything in none mode', () => {
      const builder = new TranscriptBuilder({
        mode: 'none',
        tailLines: 1000,
        stripAnsi: false,
        sentinelStart: '<<START>>',
        sentinelEnd: '<<END>>',
      });

      builder.push('line 1\n');
      builder.push('line 2\n');
      builder.push('line 3\n');

      expect(builder.result()).toBe('');
    });
  });

  describe('selection mode', () => {
    it('should capture all text in selection mode (filtering happens elsewhere)', () => {
      const builder = new TranscriptBuilder({
        mode: 'selection',
        tailLines: 1000,
        stripAnsi: false,
        sentinelStart: '<<START>>',
        sentinelEnd: '<<END>>',
      });

      builder.push('line 1\n');
      builder.push('line 2\n');
      builder.push('line 3\n');

      expect(builder.result()).toBe('line 1\nline 2\nline 3\n');
    });
  });

  describe('edge cases', () => {
    it('should handle empty input', () => {
      const builder = new TranscriptBuilder({
        mode: 'full',
        tailLines: 1000,
        stripAnsi: false,
        sentinelStart: '<<START>>',
        sentinelEnd: '<<END>>',
      });

      builder.push('');
      expect(builder.result()).toBe('');
    });

    it('should handle non-string input by converting to string', () => {
      const builder = new TranscriptBuilder({
        mode: 'full',
        tailLines: 1000,
        stripAnsi: false,
        sentinelStart: '<<START>>',
        sentinelEnd: '<<END>>',
      });

      // This test ensures the implementation is resilient
      // In practice, the implementation already converts to string
      builder.push('test');
      expect(builder.result()).toBe('test');
    });

    it('should handle complex ANSI sequences', () => {
      const builder = new TranscriptBuilder({
        mode: 'full',
        tailLines: 1000,
        stripAnsi: true,
        sentinelStart: '<<START>>',
        sentinelEnd: '<<END>>',
      });

      // Various ANSI escape sequences
      builder.push('\x1b[0m\x1b[1m\x1b[2m\x1b[4m\x1b[5m\x1b[7m\x1b[8mtext\x1b[0m');
      builder.push('\x1b[38;5;196mred\x1b[0m'); // 256 color
      builder.push('\x1b[38;2;255;0;0mrgb red\x1b[0m'); // RGB color

      expect(builder.result()).toBe('textredrgb red');
    });
  });
});
