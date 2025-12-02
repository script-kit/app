// =================================================================================================
// Application lifecycle management including openAtom setter and clearCacheAtom
// =================================================================================================

import type { PromptData } from '@johnlindquist/kit/types/core';
import { atom } from 'jotai';
import { scoredChoicesAtom } from '../jotai';
import { _flaggedValue, flagsAtom } from './atoms/actions';
import { _open, loadingAtom, pidAtom, progressAtom, runningAtom } from './atoms/app-core';
import {
  cachedMainFlagsAtom,
  cachedMainPreviewAtom,
  cachedMainPromptDataAtom,
  cachedMainScoredChoicesAtom,
  cachedMainShortcutsAtom,
} from './atoms/cache';
import { _chatMessagesAtom } from './atoms/chat';
import { editorConfigAtom } from './atoms/editor';
import { formHTMLAtom } from './atoms/form';
// Import from the real atom locations
import { _inputAtom, closedInput, mouseEnabledAtom } from './atoms/input';
import { disableSubmitAtom } from './atoms/ipc';
import { logHTMLAtom, logLinesAtom } from './atoms/log';
import { audioDotAtom, webcamStreamAtom } from './atoms/media';
import { _panelHTML } from './atoms/preview';
import { _script, lastScriptClosed } from './atoms/script-state';
import { termConfigAtom } from './atoms/terminal';
// Import from facade for gradual migration
import { promptDataAtom } from './facade';
import { promptData } from './prompt-data';
import { promptBoundsAtom, promptBoundsDefault, resizeCompleteAtom, scrollToIndexAtom } from './ui-layout';
import { miniShortcutsHoveredAtom } from './utils';

// Override the openAtom setter implementation
export const openAtom = atom(
  (g) => g(_open),
  (g, s, a: boolean) => {
    if (g(_open) === a) return;

    s(mouseEnabledAtom, 0);

    // Handling closure side effects
    if (g(_open) && a === false) {
      s(resizeCompleteAtom, false);
      s(lastScriptClosed, (g(_script) as any).script?.filePath || '');

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
