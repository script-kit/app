import { useEffect, useRef } from 'react';
import { useAtomValue, useSetAtom } from 'jotai';
import { appStateLiteAtom } from '../selectors/appState';
import { ipcOutboxAtom, clearIpcOutboxAtom, pushIpcMessageAtom } from '../selectors/ipcOutbound';
import { pauseChannelAtom, pidAtom, promptDataAtom } from '../../jotai';
import { sendChannel, sendIPC } from '../services/ipc';
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

  // Track state changes for debugging but don't auto-send
  useEffect(() => {
    // Skip if state hasn't actually changed
    if (prevStateRef.current && JSON.stringify(prevStateRef.current) === JSON.stringify(state)) {
      return;
    }

    // Debug: Log significant state changes
    if (!state.focused && prevStateRef.current?.focused) {
      console.warn('State.focused became undefined', { 
        prev: prevStateRef.current?.focused,
        current: state.focused 
      });
    }

    prevStateRef.current = state;
  }, [state]);

  // Handle outbox messages - send any queued messages
  useEffect(() => {
    try {
      if (!outbox.length) return;
      if (pauseChannel) return;

      for (const msg of outbox) {
        if (typeof msg === 'object' && msg) {
          // Generic "raw" IPC message shape: { type, payload } or { channel, args }
          if ('type' in (msg as any) || ('channel' in (msg as any) && 'args' in (msg as any))) {
            // Delegate to generic helper (no AppState wrapping)
            sendIPC(msg as any);
            continue;
          }
          // State-override shape: { channel, state?: Partial<AppState> }
          if ('channel' in (msg as any)) {
            const message = msg as any;
            const override = message.state || {};
            let finalState = { ...state, ...override };
            // Protect focused from being unset by override
            if (!finalState.focused) finalState.focused = state.focused;
            
            // Debug logging for action messages
            if (message.channel === Channel.ACTION && override.action) {
              console.log('[IPCController] Sending ACTION with:', {
                channel: message.channel,
                actionName: override.action?.name,
                actionFlag: override.action?.flag,
                actionValue: override.action?.value,
                hasAction: finalState.action !== undefined
              });
            }
            
            const appMessage: AppMessage = {
              channel: message.channel,
              pid: pid || 0,
              promptId: promptData?.id || '',
              state: finalState,
            };
            // Extra diagnostics for VALUE_SUBMITTED with flags and general outbox sends
            try {
              if (message.channel === Channel.VALUE_SUBMITTED) {
                console.log('[IPCController] Sending VALUE_SUBMITTED', {
                  hasFlag: Boolean(finalState?.flag),
                  flag: finalState?.flag,
                  valueType: typeof finalState?.value,
                });
              } else {
                console.log('[IPCController] Sending message', {
                  channel: message.channel,
                  hasAction: Boolean((finalState as any)?.action),
                });
              }
            } catch {}
            // Validate before sending to prevent undefined errors
            // Note: pid can be 0 and promptId can be empty for some messages like ON_INIT
            if (appMessage.channel && appMessage.pid !== undefined && appMessage.state) {
              sendChannel(message.channel, appMessage);
            } else {
              console.error('Invalid appMessage in outbox, skipping send:', appMessage);
            }
            continue;
          }
          // Unknown shape – ignore (or log)
          // console.warn('Unknown IPC outbox message shape', msg);
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
