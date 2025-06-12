import { atomEffect } from 'jotai-effect';
import { inputFocusAtom } from '../jotai';
import { AppChannel } from '../../../shared/enums';

export const focusPromptEffect = atomEffect((get) => {
  // Observe inputFocusAtom for changes
  get(inputFocusAtom);
  window.electron.ipcRenderer.send(AppChannel.FOCUS_PROMPT);
});
