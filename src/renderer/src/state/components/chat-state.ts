// =================================================================================================
// State specific to the chat component.
// =================================================================================================

import { atom } from 'jotai';
import type { MessageType } from 'react-chat-elements';

// Stub implementations - these need to be properly extracted from jotai.ts
export const _chatMessagesAtom = atom<Partial<MessageType>[]>([]);

// Add other chat related atoms here