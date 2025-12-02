import { atom } from 'jotai';

/**
 * Outbound IPC message queue.
 * Write-only atom for enqueueing messages to be sent via IPC.
 */

// Queue of messages waiting to be sent
export const ipcOutboxAtom = atom<unknown[]>([]);

// Write-only atom to push messages to the queue
export const pushIpcMessageAtom = atom(null, (g, s, msg: unknown) => {
  const current = g(ipcOutboxAtom);
  s(ipcOutboxAtom, [...current, msg]);
});

// Write-only atom to clear the queue after sending
export const clearIpcOutboxAtom = atom(null, (_g, s) => {
  s(ipcOutboxAtom, []);
});
