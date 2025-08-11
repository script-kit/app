// =================================================================================================
// Application lifecycle management including openAtom setter and clearCacheAtom
// =================================================================================================

import { atom } from 'jotai';
import type { PromptData } from '@johnlindquist/kit/types/core';
import {
  _open,
  loadingAtom,
  progressAtom,
  pidAtom,
  runningAtom,
} from './atoms/app-core';
import {
  cachedMainPromptDataAtom,
  cachedMainScoredChoicesAtom,
  cachedMainPreviewAtom,
  cachedMainShortcutsAtom,
  cachedMainFlagsAtom,
} from './atoms/cache';

// These will be imported from their respective files once they're created
import { mouseEnabledAtom } from './input-state';
import { resizeCompleteAtom, promptBoundsAtom, promptBoundsDefault } from './ui-layout';
import { lastScriptClosed, _script } from './script-state';
import { closedInput, _inputAtom } from './input-state';
import { _panelHTML } from './atoms/preview';
import { formHTMLAtom } from './components/other-components';
import { logHTMLAtom, logLinesAtom } from './log-state';
import { flagsAtom, _flaggedValue } from './actions-state';
import { editorConfigAtom } from './components/editor-state';
import { promptData } from './prompt-data';
// Import from facade for gradual migration
import { promptDataAtom } from './facade';
import { requiresScrollAtom, scrollToIndexAtom } from './ui-layout';
import { _chatMessagesAtom } from './components/chat-state';
import { miniShortcutsHoveredAtom } from './utils';
import { audioDotAtom, webcamStreamAtom } from './components/media-state';
import { disableSubmitAtom } from './ipc';
import { termConfigAtom } from './components/terminal-state';
import { scoredChoicesAtom } from './choices-state';

// Override the openAtom setter implementation
export const openAtom = atom(
  (g) => g(_open),
  (g, s, a: boolean) => {
    if (g(_open) === a) return;

    s(mouseEnabledAtom, 0);

    // Handling closure side effects
    if (g(_open) && a === false) {
      s(resizeCompleteAtom, false);
      s(lastScriptClosed, (g(_script) as any).filePath);

      // Resetting various states on close
      s(closedInput, g(_inputAtom));
      s(_panelHTML, '');
      s(formHTMLAtom, '');
      s(logHTMLAtom, '');
      s(flagsAtom, {});
      s(_flaggedValue, '');
      s(loadingAtom, false);
      s(progressAtom, 0);
      s(editorConfigAtom, {});
      s(promptData, null);
      s(requiresScrollAtom, -1);
      s(pidAtom, 0);
      s(_chatMessagesAtom, []);
      s(runningAtom, false);
      s(miniShortcutsHoveredAtom, false);
      s(logLinesAtom, []);
      s(audioDotAtom, false);
      s(disableSubmitAtom, false);
      g(scrollToIndexAtom)(0);
      s(termConfigAtom, {
        promptId: '',
        command: '',
        cwd: '',
        env: {},
        args: [],
        closeOnExit: true,
        pid: 0,
      } as any);

      // Cleanup media streams
      const stream = g(webcamStreamAtom);
      if (stream && 'getTracks' in stream) {
        (stream as MediaStream).getTracks().forEach((track) => track.stop());
        s(webcamStreamAtom, null);
        const webcamEl = document.getElementById('webcam') as HTMLVideoElement;
        if (webcamEl) {
          webcamEl.srcObject = null;
        }
      }
    }
    s(_open, a);
  },
);

export const clearCacheAtom = atom(null, (_g, s) => {
  s(cachedMainPromptDataAtom, {});
  s(cachedMainScoredChoicesAtom, []);
  s(cachedMainPreviewAtom, '');
  s(cachedMainShortcutsAtom, []);
  s(cachedMainFlagsAtom, {});
  s(promptDataAtom, {} as PromptData);
  s(scoredChoicesAtom, []);
  s(promptBoundsAtom, promptBoundsDefault);
});
