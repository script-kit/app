// src/renderer/src/state/resize/reasons.ts
// Reason bitmask for scheduling resize. Allows coalescing and better logs.

export enum ResizeReason {
  NONE = 0,
  DOM = 1 << 0,
  UI = 1 << 1,
  PREVIEW = 1 << 2,
  TERM = 1 << 3,
  EDITOR = 1 << 4,
  THEME = 1 << 5,
  ZOOM = 1 << 6,
  WINDOW_MODE = 1 << 7,
  TABS = 1 << 8,
  MAIN_ACK = 1 << 9,
  OS_EVENT = 1 << 10,
  PANEL_SPLIT = 1 << 11,
}

export function reasonName(mask: number): string {
  if (mask === ResizeReason.NONE) return 'NONE';
  const parts: string[] = [];
  const add = (bit: ResizeReason, name: string) => {
    if ((mask & bit) === bit) parts.push(name);
  };
  add(ResizeReason.DOM, 'DOM');
  add(ResizeReason.UI, 'UI');
  add(ResizeReason.PREVIEW, 'PREVIEW');
  add(ResizeReason.TERM, 'TERM');
  add(ResizeReason.EDITOR, 'EDITOR');
  add(ResizeReason.THEME, 'THEME');
  add(ResizeReason.ZOOM, 'ZOOM');
  add(ResizeReason.WINDOW_MODE, 'WINDOW_MODE');
  add(ResizeReason.TABS, 'TABS');
  add(ResizeReason.MAIN_ACK, 'MAIN_ACK');
  add(ResizeReason.OS_EVENT, 'OS_EVENT');
  add(ResizeReason.PANEL_SPLIT, 'PANEL_SPLIT');
  return parts.join('|');
}

