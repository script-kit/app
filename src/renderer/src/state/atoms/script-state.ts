/**
 * State related to the currently executing script.
 * These atoms track script information, state, and derived properties.
 */

import type { Script } from '@johnlindquist/kit/types/core';
import { atom } from 'jotai';
import { SPLASH_PATH, noScript } from '../../../../shared/defaults';
import { kitConfigAtom } from './app-core';

export type ScriptStatus = 'idle' | 'starting' | 'running' | 'completed' | 'error';

export type ScriptStateSource = 'runtime' | 'preload' | 'user' | null;

export interface ScriptState {
  script: Script | null;
  runId: string | null;
  pid: number | null;
  status: ScriptStatus;
  source: ScriptStateSource;
  error?: string | null;
}

export const _script = atom<ScriptState>({
  script: noScript,
  runId: null,
  pid: null,
  status: 'idle',
  source: null,
  error: null,
});
export const lastScriptClosed = atom('');
export const backToMainAtom = atom(false);
export const preloadedAtom = atom(false);

// isMainScriptAtom is defined in shared-atoms.ts to avoid duplication

export const isKitScriptAtom = atom<boolean>((g) => {
  return (g(_script).script as Script)?.filePath?.includes(g(kitConfigAtom).kitPath);
});

export const isSplashAtom = atom((g) => {
  return g(_script)?.script?.filePath === SPLASH_PATH;
});

export const socialAtom = atom((g) => {
  const script = g(_script).script;
  if (script?.twitter) {
    const twitter = script.twitter;
    const username = twitter.startsWith('@') ? twitter.slice(1) : twitter;
    return {
      username: twitter,
      url: `https://twitter.com/${username}`,
    };
  }

  if (script?.github) {
    return {
      username: script.github,
      url: `https://github.com/${script.github}`,
    };
  }

  if (script?.social) {
    return {
      username: script.social || '',
      url: script.social_url || '',
    };
  }

  return undefined;
});

export const logoAtom = atom<string>('');
