// =================================================================================================
// State related to the currently executing script.
// =================================================================================================

import type { Script } from '@johnlindquist/kit/types/core';
import { atom } from 'jotai';
import { noScript, SPLASH_PATH } from '../../../shared/defaults';
import { createLogger } from '../log-utils';
import { kitConfigAtom, pidAtom, processingAtom, loadingAtom, progressAtom } from './app-core';
import { isMainScriptAtom } from './shared-atoms';

const log = createLogger('script-state.ts');

export const _script = atom<Script>(noScript);
export const lastScriptClosed = atom('');
export const backToMainAtom = atom(false);
export const preloadedAtom = atom(false);

export const scriptAtom = atom(
  (g) => g(_script),
  (g, s, a: Script) => {
    // s(lastKeyDownWasModifierAtom, false);

    const mainScriptPath = g(kitConfigAtom).mainScriptPath;
    const isMainScript = a?.filePath === mainScriptPath;
    const prevScript = g(_script);

    s(isMainScriptAtom, isMainScript);
    s(backToMainAtom, prevScript?.filePath !== mainScriptPath && isMainScript);
    // s(promptReadyAtom, false);

    if (!isMainScript) {
      // s(choicesConfigAtom, { preload: false });
      const preloaded = g(preloadedAtom);
      log.info(`${g(pidAtom)}: Preloaded? ${preloaded ? 'YES' : 'NO'}`);

      if (!preloaded) {
        // Clear preview if not preloaded and not the main script
        // s(_previewHTML, '');
      }
    }

    s(preloadedAtom, false);
    if (a?.tabs) {
      // s(tabsAtom, a?.tabs || []);
    }

    // s(mouseEnabledAtom, 0);
    s(_script, a);
    s(processingAtom, false);
    s(loadingAtom, false);
    s(progressAtom, 0);
    // s(logoAtom, a?.logo || '');
    // Reset temporary theme when script changes
    // s(_tempThemeAtom, g(themeAtom));
  },
);

export const isKitScriptAtom = atom<boolean>((g) => {
  return (g(_script) as Script)?.filePath?.includes(g(kitConfigAtom).kitPath);
});

// isMainScriptInitialAtom moved to selectors/scriptSelectors.ts to avoid circular dependency

export const isSplashAtom = atom((g) => {
  return g(scriptAtom)?.filePath === SPLASH_PATH;
});

export const socialAtom = atom((g) => {
  const script = g(scriptAtom);
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