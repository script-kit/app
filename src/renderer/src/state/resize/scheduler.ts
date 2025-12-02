// src/renderer/src/state/resize/scheduler.ts
import { atom } from 'jotai';
import { createLogger } from '../../log-utils';
import { devToolsOpenAtom, resizeTickAtom } from '../atoms/ui-elements';
import { ResizeReason, reasonName } from './reasons';

const log = createLogger('resize-scheduler');

// Accumulated reason bitmask since last schedule
export const resizePendingMaskAtom = atom<number>(ResizeReason.NONE);

// Epoch counter for logical batches (not strictly enforced yet)
export const resizeEpochAtom = atom<number>(0);

// Simple inflight flag to prevent duplicate sends until MAIN_ACK processed
export const resizeInflightAtom = atom<boolean>(false);

// Debug flag on window
declare global {
  interface Window {
    DEBUG_RESIZE?: boolean;
  }
}

// Mapping string tags to reason bits (fallback to DOM)
const mapStringToReason = (tag = ''): ResizeReason => {
  const t = String(tag).toUpperCase();
  if (t.includes('PREVIEW')) return ResizeReason.PREVIEW;
  if (t.includes('WINDOW')) return ResizeReason.WINDOW_MODE;
  if (t.includes('ZOOM')) return ResizeReason.ZOOM;
  if (t.includes('THEME')) return ResizeReason.THEME;
  if (t.includes('TERM')) return ResizeReason.TERM;
  if (t.includes('EDITOR')) return ResizeReason.EDITOR;
  if (t.includes('TAB')) return ResizeReason.TABS;
  if (t.includes('ACK')) return ResizeReason.MAIN_ACK;
  if (t.includes('OS')) return ResizeReason.OS_EVENT;
  if (t.includes('PANEL')) return ResizeReason.PANEL_SPLIT;
  if (t.includes('UI')) return ResizeReason.UI;
  return ResizeReason.DOM;
};

// Public API atom: schedule a resize with a reason mask. Coalesces and nudges controller via tick atom.
export const scheduleResizeAtom = atom(null, (g, s, reason: ResizeReason | string) => {
  const bit = typeof reason === 'number' ? (reason as number) : mapStringToReason(reason as string);
  const prev = g(resizePendingMaskAtom);
  const next = prev | bit;
  if (next !== prev) s(resizePendingMaskAtom, next);

  // Bump epoch on MAIN_ACK to help grouping in logs
  if ((bit & ResizeReason.MAIN_ACK) === ResizeReason.MAIN_ACK) {
    s(resizeEpochAtom, (e) => e + 1);
  }

  const epoch = g(resizeEpochAtom);
  const debug = typeof window !== 'undefined' && (window as any).DEBUG_RESIZE;
  if (debug) {
    log.info(
      `scheduleResize: epoch=${epoch} reason=${typeof reason === 'string' ? reason : reasonName(bit)} mask=${reasonName(next)}`,
    );
  }

  // Optional devtools gate: if enabled and devtools open, skip scheduling (keeps mask for later)
  try {
    const gateDevtools =
      typeof window !== 'undefined' &&
      ((window as any).RESIZE_GATE_DEVTOOLS === true || localStorage.getItem('RESIZE_GATE_DEVTOOLS') === 'true');
    if (gateDevtools && g(devToolsOpenAtom)) {
      if (debug) log.info('scheduleResize: gated by devtools (RESIZE_GATE_DEVTOOLS=true && devToolsOpen)');
      return;
    }
  } catch {}

  // Nudge the controller via the existing tick primitive. The controller is already debounced downstream.
  s(resizeTickAtom, (v) => v + 1);
});
