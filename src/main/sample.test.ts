import { describe, expect, it } from 'vitest';

describe('Main Process', () => {
  it('should perform a sample test', () => {
    const sum = (a: number, b: number) => a + b;
    expect(sum(2, 3)).toBe(5);
  });
});
