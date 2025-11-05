import path from 'node:path';
import { KIT_FIRST_PATH, kenvPath, kitDotEnvPath, kitPath } from '@johnlindquist/kit/core/utils';
import { app } from 'electron';
import { snapshot } from 'valtio';
import { getCleanShellEnv } from './shell';
import { kitState, kitStore } from './state';
import { getVersion } from './version';

export const createEnv = (): Readonly<Partial<Record<string, string>>> => {
  const PATH = KIT_FIRST_PATH + path.delimiter + process?.env?.PATH;

  // Get cached clean shell environment for external applications
  const cleanShellEnv = getCleanShellEnv();
  const kitCleanShellEnv = cleanShellEnv ? JSON.stringify(cleanShellEnv.env) : '';

  return {
    ...process.env,
    NODE_NO_WARNINGS: '1',
    KIT_NODE_PATH: kitState.KIT_NODE_PATH,
    KIT_CONTEXT: 'app',
    KENV: kenvPath(),
    KIT: kitPath(),
    KIT_DOTENV_PATH: kitDotEnvPath(),
    KIT_APP_VERSION: getVersion(),
    FORCE_COLOR: '1',
    PATH,
    KIT_APP_PATH: app.getAppPath(),
    KIT_ACCESSIBILITY: kitState.isMac && kitStore.get('accessibilityAuthorized') ? 'true' : 'false',
    KIT_CLEAN_SHELL_ENV: kitCleanShellEnv, // Clean shell env for external apps
    ...snapshot(kitState.kenvEnv),
  };
};

/**
 * Parse a boolean from kitState.kenvEnv[key]. Accepts 'true'/'false' (case-insensitive).
 * If not set or invalid, returns the provided default.
 */
export function envBool(key: string, defaultValue: boolean): boolean {
  const raw = (kitState.kenvEnv as any)?.[key];
  if (typeof raw !== 'string') return defaultValue;
  const v = raw.trim().toLowerCase();
  if (v === 'true') return true;
  if (v === 'false') return false;
  return defaultValue;
}

/**
 * Parse a number from kitState.kenvEnv[key]. If invalid or not set, returns defaultValue.
 * Optionally clamps to a min/max range.
 */
export function envNumber(
  key: string,
  defaultValue: number,
  opts: { min?: number; max?: number } = {},
): number {
  const raw = (kitState.kenvEnv as any)?.[key];
  const n = typeof raw === 'string' ? Number.parseFloat(raw) : Number(raw);
  const valid = Number.isFinite(n) ? (n as number) : defaultValue;
  const min = Number.isFinite(opts.min as number) ? (opts.min as number) : undefined;
  const max = Number.isFinite(opts.max as number) ? (opts.max as number) : undefined;
  let clamped = valid;
  if (typeof min === 'number' && clamped < min) clamped = min;
  if (typeof max === 'number' && clamped > max) clamped = max;
  return clamped;
}
