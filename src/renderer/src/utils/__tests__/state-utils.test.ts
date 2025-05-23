import { describe, expect, test } from 'vitest';
import { arraysEqual, colorUtils, dataUtils, domUtils, themeUtils } from '../state-utils';

describe('state-utils', () => {
  describe('arraysEqual', () => {
    test('should return true for equal arrays', () => {
      expect(arraysEqual(['a', 'b', 'c'], ['a', 'b', 'c'])).toBe(true);
    });

    test('should return false for different arrays', () => {
      expect(arraysEqual(['a', 'b', 'c'], ['a', 'b', 'd'])).toBe(false);
    });

    test('should return false for arrays of different lengths', () => {
      expect(arraysEqual(['a', 'b'], ['a', 'b', 'c'])).toBe(false);
    });
  });

  describe('colorUtils', () => {
    test('hexToRgb should convert hex to RGB', () => {
      expect(colorUtils.hexToRgb('#ff0000')).toEqual({ r: 255, g: 0, b: 0 });
      expect(colorUtils.hexToRgb('#00ff00')).toEqual({ r: 0, g: 255, b: 0 });
      expect(colorUtils.hexToRgb('#0000ff')).toEqual({ r: 0, g: 0, b: 255 });
    });

    test('convertColor should return all formats', () => {
      const result = colorUtils.convertColor('#ff0000');
      expect(result.sRGBHex).toBe('#ff0000');
      expect(result.rgb).toBe('rgb(255, 0, 0)');
      expect(result.rgba).toBe('rgba(255, 0, 0, 1)');
    });
  });

  describe('themeUtils', () => {
    test('parseThemeString should extract CSS variables', () => {
      const theme = ':root { --color-primary: red; --color-secondary: blue; }';
      const result = themeUtils.parseThemeString(theme);
      expect(result['color-primary']).toBe('red');
      expect(result['color-secondary']).toBe('blue');
    });

    test('getAppearanceFromTheme should return appearance', () => {
      expect(themeUtils.getAppearanceFromTheme({ appearance: 'dark' })).toBe('dark');
      expect(themeUtils.getAppearanceFromTheme({})).toBe('dark'); // default
    });
  });

  describe('dataUtils', () => {
    test('transformKeys should transform array items correctly', () => {
      const items = [
        { key: 'cmd+k', name: 'action1' },
        { key: 'ctrl+p', name: 'action2' },
        { noKey: 'should be filtered' },
      ];

      const result = dataUtils.transformKeys(items, 'key', 'action');

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({ type: 'action', value: 'cmd+k' });
      expect(result[1]).toEqual({ type: 'action', value: 'ctrl+p' });
    });

    test('transformKeys should handle spaces in keys', () => {
      const items = [{ key: 'cmd k', name: 'action1' }];
      const result = dataUtils.transformKeys(items, 'key', 'shortcut');

      expect(result[0].value).toBe('cmd+k');
    });
  });
});
