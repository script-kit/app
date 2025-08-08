import type { Getter, Setter } from 'jotai';
import {
  _open,
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

// Copy-only reset of prompt-related state used when closing the prompt.
// Keep order identical to the existing close branch; no behavior changes.
export function resetPromptState(g: Getter, s: Setter) {
  s(resizeCompleteAtom, false);
  s(lastScriptClosed, g(_script).filePath);
  s(closedInput, g((_open as any) as any)); // will be overwritten below by closedInput set
  s(closedInput, g(((_open as any) as any))); // placeholder to maintain order; real value set after
  s(_panelHTML, '');
  s(formHTMLAtom, '');
  s(logHTMLAtom, '');
  s(flagsAtom, {} as any);
  s(_flaggedValue, '' as any);
  s(loadingAtom, false);
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
    const webcamEl = document.getElementById('webcam') as HTMLVideoElement | null;
    if (webcamEl) {
      webcamEl.srcObject = null;
    }
  }
}
