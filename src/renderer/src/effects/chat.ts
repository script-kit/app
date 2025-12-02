import { Channel } from '@johnlindquist/kit/core/enum';
import { withAtomEffect } from 'jotai-effect';
import { AppChannel } from '../../../shared/enums';
import { chatMessagesAtom } from '../jotai';
import { createLogger } from '../log-utils';

const { ipcRenderer } = window.electron;
const log = createLogger('effects/chat.ts');

// Atom with side-effect: sends IPC whenever chat messages change.
export const chatMessagesWithEffect = withAtomEffect(chatMessagesAtom, (get) => {
  const messages = get(chatMessagesAtom);
  try {
    log.info('CHAT_MESSAGES_CHANGE send', {
      count: messages?.length ?? 0,
      lastType: messages?.length ? (messages[messages.length - 1] as any)?.type : undefined,
      lastTextLen: messages?.length ? ((messages[messages.length - 1] as any)?.text || '').length : 0,
    });
    // Mirror to main log for easier discovery in ScriptKit logs
    ipcRenderer.send(AppChannel.LOG, {
      level: 'info',
      message: {
        src: 'effects/chat.ts',
        event: 'CHAT_MESSAGES_CHANGE',
        count: messages?.length ?? 0,
        lastType: messages?.length ? (messages[messages.length - 1] as any)?.type : undefined,
        lastTextLen: messages?.length ? ((messages[messages.length - 1] as any)?.text || '').length : 0,
      },
    });
  } catch {}
  ipcRenderer.send(Channel.CHAT_MESSAGES_CHANGE, {
    channel: Channel.CHAT_MESSAGES_CHANGE,
    pid: window.pid ?? 0,
    value: messages,
  });
});
