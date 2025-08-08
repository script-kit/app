/**
 * Chat state atoms.
 * State specific to the chat component.
 */

import { atom } from 'jotai';
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
    }
  } catch (error) {
    log.error("Error setting chat message", error);
  }
});

export const chatMessageSubmitAtom = atom(null, (_g, _s, _a: { text: string; index: number }) => {
  // Will be wired to channel later
});

export const preventChatScrollAtom = atom(false);