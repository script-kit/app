import type { SnippetInfo } from '../shared/types';

export const snippetMap = new Map<string, SnippetInfo>();

export const getClipboardHistory = () => {
  return [];
};

export const removeFromClipboardHistory = (_itemId: string) => {};

export const clearClipboardHistory = () => {};

export const preStartConfigureInterval = async () => {};

export const configureInterval = async () => {};

export const toggleTickOn = async () => {};

export const destroyInterval = () => {};

export const snippetScriptChanged = () => {
  return null as any;
};

export const removeSnippet = (_filePath: string) => {};

export const clearTickTimers = () => {};
export const startClipboardAndKeyboardWatchers = () => {};

export const addTextSnippet = () => {};
