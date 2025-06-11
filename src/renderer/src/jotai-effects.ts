import { Channel } from '@johnlindquist/kit/core/enum';
import { ipcRenderer } from 'electron';
import { atom } from 'jotai';
import { atomEffect, withAtomEffect } from 'jotai-effect';
import { unstable_batchedUpdates } from 'react-dom';
import {
  appearanceAtom,
  boundsAtom,
  chatMessagesAtom,
  footerHiddenAtom,
  getMainHeight,
  mainHeightAtom,
  previewEnabledAtom,
  previewHTMLAtom,
  promptResizedByHumanAtom,
  themeAtom,
  topHeightAtom,
  uiAtom,
} from './jotai';
import { debounce } from './utils';

// --- 1. Theme → Appearance Effect ---
export const themeUpdateTriggerAtom = atom(0);

export const themeAppearanceEffect = atomEffect((get, set) => {
  get(themeUpdateTriggerAtom); // dependency to trigger on updates
  const theme = get(themeAtom);
  const appearanceMatch = /--appearance:\s*(\w+)/.exec(theme);
  const appearance = appearanceMatch?.[1] as 'light' | 'dark' | undefined;

  if (appearance) {
    set(appearanceAtom, appearance);
  }
});

// --- 2. Resize Effect ---
// Atom to accumulate resize requests
export const resizeRequestAtom = atom<string[]>([]);

const performResize = debounce((_reasons: string[], get: any, set: any) => {
  unstable_batchedUpdates(() => {
    const mainHeight = getMainHeight(get as any, set as any);

    if (mainHeight > 0) {
      set(mainHeightAtom, mainHeight);

      // Send IPC resize message
      ipcRenderer.send(Channel.RESIZE, {
        channel: Channel.RESIZE,
        mainHeight,
      });

      // Send bounds if needed
      const bounds = get(boundsAtom);
      if (bounds?.ignoreBoundsChanges) {
        ipcRenderer.send(Channel.SET_BOUNDS, {
          ...bounds,
          height: bounds.height ?? 0,
          width: bounds.width ?? 0,
        });
      }
    }
  });
}, 250);

export const resizeEffect = atomEffect((get, set) => {
  // Watch all atoms that influence geometry
  get(mainHeightAtom);
  get(topHeightAtom);
  get(footerHiddenAtom);
  get(previewHTMLAtom);
  get(previewEnabledAtom);
  get(uiAtom);
  get(boundsAtom);
  get(promptResizedByHumanAtom);

  // Get accumulated resize requests
  const reasons = get(resizeRequestAtom);

  if (reasons.length > 0) {
    // Check if any reason is SETTLED
    const hasSettled = reasons.includes('SETTLED');

    if (hasSettled) {
      // Execute immediately for SETTLED
      performResize.cancel();
      performResize(reasons, get, set);
      performResize.flush();
    } else {
      // Debounce other resize requests
      performResize(reasons, get, set);
    }

    // Clear the requests
    set(resizeRequestAtom, []);
  }
});

// Helper to request a resize
export const requestResize = (set: any, reason: string) => {
  set(resizeRequestAtom, (prev: string[]) => [...prev, reason]);
};

// --- 3. Chat Messages Effect ---
let chatMessageQueue: any[] = [];
let chatScheduled = false;

const sendChatMessages = () => {
  if (chatMessageQueue.length === 0) {
    chatScheduled = false;
    return;
  }

  unstable_batchedUpdates(() => {
    const messages = [...chatMessageQueue];
    chatMessageQueue = [];
    chatScheduled = false;

    messages.forEach(({ channel, pid, value }) => {
      ipcRenderer.send(channel, { channel, pid, value });
    });
  });
};

export const chatMessagesEffect = atomEffect((get, _set) => {
  const messages = get(chatMessagesAtom);

  // Queue the IPC message
  chatMessageQueue.push({
    channel: Channel.CHAT_MESSAGES_CHANGE,
    pid: window.pid ?? 0,
    value: messages,
  });

  // Schedule send if not already scheduled
  if (!chatScheduled) {
    chatScheduled = true;
    // Use requestIdleCallback for better performance
    if ('requestIdleCallback' in window) {
      requestIdleCallback(sendChatMessages, { timeout: 16 }); // ~60fps
    } else {
      setTimeout(sendChatMessages, 16);
    }
  }
});

// Wrapped atom for backward compatibility
export const chatMessagesWithEffect = withAtomEffect(chatMessagesAtom, () => {
  // The effect is handled by chatMessagesEffect
  // This is just to ensure the effect is active
});

// Active effect atoms to ensure they're loaded
export const activeThemeEffectAtom = atom((get) => {
  get(themeAppearanceEffect);
  return true;
});

export const activeResizeEffectAtom = atom((get) => {
  get(resizeEffect);
  return true;
});

export const activeChatEffectAtom = atom((get) => {
  get(chatMessagesEffect);
  return true;
});
