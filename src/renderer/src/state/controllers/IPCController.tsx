import { useEffect, useRef } from 'react';
import { useAtomValue, useSetAtom } from 'jotai';
import { appStateLiteAtom } from '../selectors/appState';
import { ipcOutboxAtom, clearIpcOutboxAtom, pushIpcMessageAtom } from '../selectors/ipcOutbound';
import { pauseChannelAtom, pidAtom, promptDataAtom } from '../../jotai';
import { sendChannel } from '../services/ipc';
import { Channel } from '@johnlindquist/kit/core/enum';
import type { AppMessage } from '@johnlindquist/kit/types/kitapp';

/**
 * Controller that handles IPC message publishing.
 * This is the ONLY place where channel messages are sent (except resize).
 */
export function IPCController() {
  // All hooks must be called unconditionally
  const pauseChannel = useAtomValue(pauseChannelAtom);
  const pid = useAtomValue(pidAtom);
  const promptData = useAtomValue(promptDataAtom);
  const outbox = useAtomValue(ipcOutboxAtom);
  const clearOutbox = useSetAtom(clearIpcOutboxAtom);
  const state = useAtomValue(appStateLiteAtom);
  const prevStateRef = useRef<typeof state>();

  // Handle state changes - send to main process when state changes
  useEffect(() => {
    try {
      // Skip if channel is paused
      if (pauseChannel) return;

      // Skip if state hasn't actually changed
      if (prevStateRef.current && JSON.stringify(prevStateRef.current) === JSON.stringify(state)) {
        return;
      }

      // Don't send state updates before we have a prompt
      if (!promptData?.id) return;

      // Debug: Log the state we're about to send
      if (!state.focused) {
        console.error('WARNING: state.focused is undefined!', state);
      }
      
      const appMessage: AppMessage = {
        channel: Channel.APP_STATE_CHANGED,
        pid: pid || 0,
        promptId: promptData.id,
        state,
      };

      sendChannel(Channel.APP_STATE_CHANGED, appMessage);
      prevStateRef.current = state;
    } catch (error) {
      console.error('Error in IPCController state change handler:', error);
    }
  }, [state, pauseChannel, pid, promptData]);

  // Handle outbox messages - send any queued messages
  useEffect(() => {
    try {
      if (!outbox.length) return;
      if (pauseChannel) return;

      for (const msg of outbox) {
        if (typeof msg === 'object' && msg !== null && 'channel' in msg) {
          const message = msg as any;
          const appMessage: AppMessage = {
            channel: message.channel,
            pid: pid || 0,
            promptId: promptData?.id || '',
            state: message.state || state,
          };
          sendChannel(message.channel, appMessage);
        }
      }
      
      clearOutbox();
    } catch (error) {
      console.error('Error in IPCController outbox handler:', error);
    }
  }, [outbox, clearOutbox, pauseChannel, pid, promptData, state]);

  return null;
}

/**
 * Helper hook for components that need to send channel messages.
 * Use this instead of directly accessing channelAtom.
 */
export function useChannel() {
  const pushMessage = useSetAtom(pushIpcMessageAtom);
  const pauseChannel = useAtomValue(pauseChannelAtom);
  const state = useAtomValue(appStateLiteAtom);

  return (channel: Channel, override?: any) => {
    if (pauseChannel) return;
    
    let finalState = state;
    if (override) {
      finalState = { ...state, ...override };
      
      // CRITICAL FIX: Ensure 'focused' is never undefined/null after override
      if (!finalState.focused) {
        finalState.focused = state.focused;
        console.warn(`[useChannel] Protected 'focused' property from being unset by override. Channel: ${channel}`, override);
      }
    }
    
    pushMessage({
      channel,
      state: finalState,
    });
  };
}