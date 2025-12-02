import { atomEffect } from 'jotai-effect';
import { AppChannel } from '../../../shared/enums';
import { devToolsOpenAtom, inputFocusAtom } from '../jotai';

export const focusPromptEffect = atomEffect((get) => {
  // Observe inputFocusAtom for changes
  get(inputFocusAtom);

  // Don't send focus request if DevTools are open
  const devToolsOpen = get(devToolsOpenAtom);
  if (!devToolsOpen) {
    window.electron.ipcRenderer.send(AppChannel.FOCUS_PROMPT);
  }
});
