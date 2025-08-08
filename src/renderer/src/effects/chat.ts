import { withAtomEffect } from 'jotai-effect';
import { chatMessagesAtom } from "../state";
import { Channel } from '@johnlindquist/kit/core/enum';

const { ipcRenderer } = window.electron;

// Atom with side-effect: sends IPC whenever chat messages change.
export const chatMessagesWithEffect = withAtomEffect(chatMessagesAtom, (get) => {
  const messages = get(chatMessagesAtom);
  ipcRenderer.send(Channel.CHAT_MESSAGES_CHANGE, {
    channel: Channel.CHAT_MESSAGES_CHANGE,
    pid: window.pid ?? 0,
    value: messages,
  });
});
