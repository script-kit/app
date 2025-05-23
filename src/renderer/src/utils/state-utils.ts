/**
 * Pure utility functions extracted from jotai.ts
 * These functions have no side effects and can be safely tested
 */

/**
 * Compares two string arrays for equality
 */
export function arraysEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) {
    return false;
  }
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) {
      return false;
    }
  }
  return true;
}

/**
 * Color utility functions for color picker functionality
 */
export const colorUtils = {
  /**
   * Converts hex color to RGB object
   */
  hexToRgb(hex: string): { r: number; g: number; b: number } | null {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result
      ? {
          r: Number.parseInt(result[1], 16),
          g: Number.parseInt(result[2], 16),
          b: Number.parseInt(result[3], 16),
        }
      : null;
  },

  /**
   * Converts RGB values to HSL object
   */
  rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
    const rNorm = r / 255;
    const gNorm = g / 255;
    const bNorm = b / 255;
    const max = Math.max(rNorm, gNorm, bNorm);
    const min = Math.min(rNorm, gNorm, bNorm);
    let h = 0;
    let s = 0;
    const l = (max + min) / 2;

    if (max === min) {
      h = s = 0;
    } else {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      switch (max) {
        case rNorm:
          h = (gNorm - bNorm) / d + (gNorm < bNorm ? 6 : 0);
          break;
        case gNorm:
          h = (bNorm - rNorm) / d + 2;
          break;
        case bNorm:
          h = (rNorm - gNorm) / d + 4;
          break;
      }
      h /= 6;
    }

    return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) };
  },

  /**
   * Converts RGB values to CMYK object
   */
  rgbToCmyk(r: number, g: number, b: number): { c: number; m: number; y: number; k: number } {
    let c = 1 - r / 255;
    let m = 1 - g / 255;
    let y = 1 - b / 255;
    const k = Math.min(c, Math.min(m, y));

    c = (c - k) / (1 - k);
    m = (m - k) / (1 - k);
    y = (y - k) / (1 - k);

    return {
      c: Math.round(c * 100),
      m: Math.round(m * 100),
      y: Math.round(y * 100),
      k: Math.round(k * 100),
    };
  },

  /**
   * Converts hex color to various color formats
   */
  convertColor(sRGBHex: string) {
    const rgb = this.hexToRgb(sRGBHex) || { r: 0, g: 0, b: 0 };
    const hsl = this.rgbToHsl(rgb.r, rgb.g, rgb.b);
    const cmyk = this.rgbToCmyk(rgb.r, rgb.g, rgb.b);

    return {
      sRGBHex,
      rgb: `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`,
      rgba: `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 1)`,
      hsl: `hsl(${hsl.h}, ${hsl.s}%, ${hsl.l}%)`,
      hsla: `hsla(${hsl.h}, ${hsl.s}%, ${hsl.l}%, 1)`,
      cmyk: `cmyk(${cmyk.c}%, ${cmyk.m}%, ${cmyk.y}%, ${cmyk.k}%)`,
    };
  },
};

/**
 * DOM utility functions for HTML processing
 */
export const domUtils = {
  /**
   * Processes HTML to ensure it has a submit button for forms
   * Returns the processed HTML body innerHTML
   */
  ensureFormHasSubmit(html: string): string {
    const parser = new DOMParser();
    const htmlDoc = parser.parseFromString(html, 'text/html');

    const inputs = htmlDoc.getElementsByTagName('input');
    const buttons = htmlDoc.getElementsByTagName('button');
    const hasSubmit =
      Array.from(inputs).some((input) => input.type.toLowerCase() === 'submit') ||
      Array.from(buttons).some((button) => button.type.toLowerCase() === 'submit');

    if (!hasSubmit) {
      const hiddenSubmit = htmlDoc.createElement('input');
      hiddenSubmit.type = 'submit';
      hiddenSubmit.style.display = 'none';
      htmlDoc.body.appendChild(hiddenSubmit);
    }

    return htmlDoc.body.innerHTML;
  },
};

/**
 * Theme utility functions
 */
export const themeUtils = {
  /**
   * Parses a theme string to extract CSS variables
   * Returns an object with CSS variable key-value pairs
   */
  parseThemeString(theme: string): Record<string, string> {
    const themeObj: Record<string, string> = {};

    try {
      const lines = theme.split('}')[0].split('{')[1].trim().split(';');

      for (const line of lines) {
        const [key, value] = line.split(':').map((s) => s.trim());
        if (key && value) {
          themeObj[key.replace('--', '')] = value.replace(/;$/, '');
        }
      }
    } catch (error) {
      // Return empty object if parsing fails
      return {};
    }

    return themeObj;
  },

  /**
   * Extracts appearance value from parsed theme object
   */
  getAppearanceFromTheme(themeObj: Record<string, string>): 'light' | 'dark' | 'auto' {
    return (themeObj?.appearance as 'light' | 'dark' | 'auto') || 'dark';
  },
};

/**
 * Data transformation utility functions
 */
export const dataUtils = {
  /**
   * Transforms an array of items by extracting specific key values and converting them to a standardized format
   * Used for processing shortcuts, actions, and flags into a consistent structure
   */
  transformKeys<T extends Record<string, any>>(
    items: T[],
    keyName: keyof T,
    type: 'shortcut' | 'action' | 'flag',
  ): Array<{ type: string; value: string }> {
    return items
      .map((item) => {
        const key = item[keyName];
        if (key) {
          const value = String(key).replaceAll(' ', '+');
          return {
            type,
            value,
          };
        }
        return false;
      })
      .filter(Boolean) as Array<{ type: string; value: string }>;
  },
};
