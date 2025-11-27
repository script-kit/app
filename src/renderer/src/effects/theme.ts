/**
 * Theme synchronization effect.
 * Synchronizes the CSS theme string with Jotai atoms and DOM properties.
 *
 * ## Responsibilities
 * 1. Extract `--appearance` from theme CSS and sync to `appearanceAtom`
 * 2. Extract platform-specific opacity and apply to document root
 *
 * ## Platform Opacity
 * Themes define three opacity values for different platforms:
 * - `--opacity-mac`: macOS (typically lower for vibrancy effect)
 * - `--opacity-win`: Windows (typically higher for solid background)
 * - `--opacity-other`: Linux and other platforms
 *
 * This effect selects the appropriate value and sets `--opacity` on the document.
 *
 * @see {@link @johnlindquist/kit/core/theme-utils} for shared utility functions
 * @module theme-effect
 */

import { atomEffect } from 'jotai-effect';
import { themeAtom, appearanceAtom } from '../jotai';
import { appConfigAtom } from '../state/atoms/app-core';
import type { Appearance } from '../state/atoms/theme';

/**
 * Default opacity value when not specified in theme.
 */
const DEFAULT_OPACITY = '0.5';

/**
 * Extract appearance (light/dark) from theme CSS.
 * @internal
 */
function extractAppearance(css: string): Appearance | undefined {
  const match = /--appearance:\s*(\w+)/.exec(css);
  const value = match?.[1];
  if (value === 'light' || value === 'dark') {
    return value;
  }
  return undefined;
}

/**
 * Resolve platform-specific opacity from theme CSS.
 * @internal
 */
function resolveOpacity(
  css: string,
  platform: 'mac' | 'win' | 'other'
): string {
  const key = `--opacity-${platform}`;
  const match = new RegExp(`${key}:\\s*([\\d.]+)`).exec(css);
  return match?.[1] ?? DEFAULT_OPACITY;
}

/**
 * Detect platform from app config.
 * @internal
 */
function detectPlatform(appConfig: { isMac: boolean; isWin: boolean }): 'mac' | 'win' | 'other' {
  if (appConfig.isMac) return 'mac';
  if (appConfig.isWin) return 'win';
  return 'other';
}

/**
 * Synchronize appearanceAtom (light/dark) with the current CSS string in themeAtom.
 * Also sets --opacity based on platform from the theme's platform-specific opacity values.
 *
 * This effect runs whenever themeAtom changes, ensuring the UI stays in sync
 * with the theme CSS variables.
 */
export const themeAppearanceEffect = atomEffect((get, set) => {
  const theme = get(themeAtom);
  const appConfig = get(appConfigAtom);

  // Extract and sync appearance
  const appearance = extractAppearance(theme);
  if (appearance) {
    set(appearanceAtom, appearance);
  }

  // Resolve and apply platform-specific opacity
  const platform = detectPlatform(appConfig);
  const opacity = resolveOpacity(theme, platform);
  document.documentElement.style.setProperty('--opacity', opacity);
});
