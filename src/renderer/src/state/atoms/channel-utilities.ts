/**
 * Channel communication utility atoms.
 * These atoms handle IPC communication and message sending.
 */

import { atom } from 'jotai';
import { Channel, AppChannel } from '@johnlindquist/kit/core/enum';
import type { Choice, Action } from '@johnlindquist/kit/types/core';
import { colorUtils } from '../../utils/state-utils';
import log from 'electron-log/renderer';
import { ipcRenderer } from '../../utils/electron-renderer';
import {
  channelAtom,
  pidAtom,
  editorHistory,
  shortcutsAtom,
  enterLastPressedAtom,
} from '../shared-dependencies';

export const changeAtom = atom((g) => (data: any) => {
  const channel = g(channelAtom);
  channel(Channel.CHANGE, { value: data });
});

export const runMainScriptAtom = atom(() => () => {
  ipcRenderer.send(AppChannel.RUN_MAIN_SCRIPT);
});

export const getEditorHistoryAtom = atom((g) => () => {
  const channel = g(channelAtom);
  channel(Channel.GET_EDITOR_HISTORY, { editorHistory: g(editorHistory) });
});

export const colorAtom = atom((g) => {
  return async () => {
    try {
      // @ts-ignore -- EyeDropper API might not be in standard TS types yet
      const eyeDropper = new EyeDropper();
      const { sRGBHex } = await eyeDropper.open();

      const color = colorUtils.convertColor(sRGBHex);
      const channel = Channel.GET_COLOR;
      const pid = g(pidAtom);

      const appMessage = {
        channel,
        pid: pid || 0,
        value: color,
      };

      ipcRenderer.send(channel, appMessage);
      return color;
    } catch (error) {
      // User cancelled or EyeDropper failed
      return '';
    }
  };
});

export const triggerKeywordAtom = atom(
  (_g) => { },
  (
    g,
    _s,
    { keyword, choice }: { keyword: string; choice: Choice },
  ) => {
    const channel = g(channelAtom);
    channel(Channel.KEYWORD_TRIGGERED, {
      keyword,
      focused: choice,
      value: choice?.value,
    });
  },
);

export const sendShortcutAtom = atom(null, (g, s, shortcut: string) => {
  const channel = g(channelAtom);
  const hasEnterShortcut = g(shortcutsAtom).find((s) => s.key === 'enter');
  log.info('🎬 Send shortcut', { shortcut, hasEnterShortcut });

  // If 'enter' is pressed and not defined as a specific shortcut, treat it as a submission trigger (tracked via time)
  if (shortcut === 'enter' && !hasEnterShortcut) {
    s(enterLastPressedAtom, new Date());
  } else {
    // Otherwise, send it as a shortcut event.
    channel(Channel.SHORTCUT, { shortcut });
  }
});

export const sendActionAtom = atom(null, (g, _s, action: Action) => {
  const channel = g(channelAtom);
  log.info(`👉 Sending action: ${action.name}`);
  channel(Channel.ACTION, { action });
});