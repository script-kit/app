/**
 * State related to the currently executing script.
 * These atoms track script information, state, and derived properties.
 */

import type { Script } from '@johnlindquist/kit/types/core';
import { atom } from 'jotai';
import { SPLASH_PATH, noScript } from '../../../../shared/defaults';
import { kitConfigAtom, appConfigAtom } from './app-core';
import { createLogger } from '../../log-utils';

const log = createLogger('script-state.ts');

export const _script = atom<Script>(noScript);
export const lastScriptClosed = atom('');
export const backToMainAtom = atom(false);
export const preloadedAtom = atom(false);

// isMainScriptAtom moved to shared-atoms.ts to avoid duplication

export const isKitScriptAtom = atom<boolean>((g) => {
  return (g(_script) as Script)?.filePath?.includes(g(kitConfigAtom).kitPath);
});

export const isSplashAtom = atom((g) => {
  return g(_script)?.filePath === SPLASH_PATH;
});

export const socialAtom = atom((g) => {
  const script = g(_script);
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