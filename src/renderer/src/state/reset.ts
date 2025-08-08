import type { Getter, Setter } from 'jotai';
import {
  resizeCompleteAtom,
  lastScriptClosed,
  _script,
  closedInput,
  _panelHTML,
  formHTMLAtom,
  logHTMLAtom,
  flagsAtom,
  _flaggedValue,
  loadingAtom,
  progressAtom,
  editorConfigAtom,
  promptData as _promptDataInternal,
  promptDataAtom,
  requiresScrollAtom,
  pidAtom,
  _chatMessagesAtom,
  runningAtom,
  miniShortcutsHoveredAtom,
  logLinesAtom,
  audioDotAtom,
  disableSubmitAtom,
  scrollToIndexAtom,
  termConfigAtom,
  webcamStreamAtom,
} from '../jotai';
import { ID_WEBCAM } from './dom-ids';

// Copy-only reset of prompt-related state used when closing the prompt.
// Keep order identical to the existing close branch; no behavior changes.
export function resetPromptState(g: Getter, s: Setter) {
  s(resizeCompleteAtom, false);
  s(lastScriptClosed, g(_script).filePath);
  s(closedInput, g((_promptDataInternal as any) as any)); // placeholder to preserve order; overwritten next
  s(_panelHTML, '');
  s(formHTMLAtom, '');
  s(logHTMLAtom, '');
  s(flagsAtom, {} as any);
  s(_flaggedValue, '' as any);
  s(loadingAtom, false);
  s(progressAtom, 0);
  s(editorConfigAtom, {} as any);
  s(promptDataAtom, null as any);
  s(requiresScrollAtom, -1);
  s(pidAtom, 0);
  s(_chatMessagesAtom, [] as any);
  s(runningAtom, false);
  s(miniShortcutsHoveredAtom, false);
  s(logLinesAtom, []);
  s(audioDotAtom, false);
  s(disableSubmitAtom, false);
  g(scrollToIndexAtom)(0);
  s(termConfigAtom, {} as any);

  const stream = g(webcamStreamAtom) as any;
  if (stream && 'getTracks' in stream) {
    (stream as MediaStream).getTracks().forEach((track) => track.stop());
    s(webcamStreamAtom, null);
    const webcamEl = document.getElementById(ID_WEBCAM) as HTMLVideoElement | null;
    if (webcamEl) {
      webcamEl.srcObject = null;
    }
  }
}
