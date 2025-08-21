/**
 * Chat state atoms.
 * State specific to the chat component.
 */

import { atom } from 'jotai';
import { Channel } from '@johnlindquist/kit/core/enum';
import { AppChannel } from '../../../../shared/enums';
import { channelAtom } from '../shared-dependencies';
import type { MessageType } from 'react-chat-elements';
import { createLogger } from '../../log-utils';

const log = createLogger('chat.ts');

type MessageTypeWithIndex = MessageType & { index: number };

export const _chatMessagesAtom = atom<Partial<MessageType>[]>([]);
export const chatMessagesAtom = atom(
  (g) => g(_chatMessagesAtom),
  (_g, s, a: Partial<MessageTypeWithIndex>[]) => {
    // Ensure indices are set
    for (let i = 0; i < a.length; i++) {
      a[i].index = i;
    }
    s(_chatMessagesAtom, a);
  },
);

export const addChatMessageAtom = atom(null, (g, s, a: MessageType) => {
  const prev = g(chatMessagesAtom);
  const updated = [...prev, a];
  const index = updated.length - 1;
  (a as MessageTypeWithIndex).index = index;
  s(chatMessagesAtom, updated);

  // Use shared channel sender; value will be adapted in main for child consumption
  const send = g(channelAtom);
  log.info('CHAT_ADD_MESSAGE send', {
    index,
    hasText: Boolean((a as any)?.text),
    textLen: ((a as any)?.text || '').length,
    type: (a as any)?.type,
  });
  send(Channel.CHAT_ADD_MESSAGE, { value: a });

  try {
    const { ipcRenderer } = window.electron;
    ipcRenderer.send(AppChannel.LOG, {
      level: 'info',
      message: {
        src: 'chat.ts',
        event: 'CHAT_ADD_MESSAGE',
        index,
        hasText: Boolean((a as any)?.text),
        textLen: ((a as any)?.text || '').length,
        type: (a as any)?.type,
      },
    });
  } catch {}
});

export const chatPushTokenAtom = atom(null, (g, s, a: string) => {
  const prev = g(chatMessagesAtom);
  const messages = [...prev];
  const index = messages.length - 1;
  
  if (index < 0) {
    return;
  }
  
  try {
    const lastMessage = messages[index] as MessageTypeWithIndex;
    // Append token to the last message
    lastMessage.text = ((lastMessage.text || '') + a).trim();
    lastMessage.index = index;
    
    s(chatMessagesAtom, messages);

    // Stream token update via shared channel sender
    const send = g(channelAtom);
    log.info('CHAT_PUSH_TOKEN send', {
      index,
      appendLen: a.length,
      totalTextLen: ((lastMessage.text || '') as string).length,
    });
    send(Channel.CHAT_PUSH_TOKEN, { value: lastMessage });

    try {
      const { ipcRenderer } = window.electron;
      ipcRenderer.send(AppChannel.LOG, {
        level: 'info',
        message: {
          src: 'chat.ts',
          event: 'CHAT_PUSH_TOKEN',
          index,
          appendLen: a.length,
          totalTextLen: ((lastMessage.text || '') as string).length,
        },
      });
    } catch {}
  } catch (error) {
    log.error("Error pushing chat token", error);
    // Reset if something goes fundamentally wrong with the structure
    s(chatMessagesAtom, []);
  }
});

export const setChatMessageAtom = atom(null, (g, s, a: { index: number; message: MessageType }) => {
  const prev = g(chatMessagesAtom);
  const messages = [...prev];
  // Handle negative indexing (e.g., -1 is the last message)
  const messageIndex = a.index < 0 ? messages.length + a.index : a.index;
  
  try {
    if (messageIndex >= 0 && messageIndex < messages.length) {
      messages[messageIndex] = a.message;
      (a.message as MessageTypeWithIndex).index = messageIndex;
      s(chatMessagesAtom, messages);

      // Notify via shared channel sender
      const send = g(channelAtom);
      log.info('CHAT_SET_MESSAGE send', {
        index: messageIndex,
        hasText: Boolean((a.message as any)?.text),
        textLen: ((a.message as any)?.text || '').length,
        type: (a.message as any)?.type,
      });
      send(Channel.CHAT_SET_MESSAGE, { value: a.message });

      try {
        const { ipcRenderer } = window.electron;
        ipcRenderer.send(AppChannel.LOG, {
          level: 'info',
          message: {
            src: 'chat.ts',
            event: 'CHAT_SET_MESSAGE',
            index: messageIndex,
            hasText: Boolean((a.message as any)?.text),
            textLen: ((a.message as any)?.text || '').length,
            type: (a.message as any)?.type,
          },
        });
      } catch {}
    }
  } catch (error) {
    log.error("Error setting chat message", error);
  }
});

export const chatMessageSubmitAtom = atom(null, (g, _s, a: { text: string; index: number }) => {
  const send = g(channelAtom);
  // Send ON_SUBMIT through channelAtom for consistency with other IPC sends
  send(Channel.ON_SUBMIT, { text: a.text, index: a.index });
});

export const preventChatScrollAtom = atom(false);
