/**
 * Common types used across the state management layer
 */

import type { Channel } from '@johnlindquist/kit/core/enum';
import type { Choice, PromptData, Script } from '@johnlindquist/kit/types/core';

// Event types
export interface PasteEvent extends ClipboardEvent {
  clipboardData: DataTransfer | null;
}

export interface DropEvent extends DragEvent {
  dataTransfer: DataTransfer | null;
}

// File types
export interface FileData {
  path: string;
  name: string;
  size: number;
  type: string;
  lastModified: number;
}

// Submit value types
export type SubmitValue = string | number | boolean | ArrayBuffer | FileData[] | Record<string, unknown> | null;

// Action types
export interface Action {
  key?: string;
  name: string;
  value?: unknown;
  shortcut?: string;
  flag?: string;
  onAction?: () => void;
}

// Shortcut types
export interface Shortcut {
  key: string;
  name: string;
  bar?: string;
  onPress?: () => void;
}

// Message types
export interface AppMessage {
  channel: Channel;
  state: Record<string, unknown>;
  override?: unknown;
}

// Theme types
export interface ThemeConfig {
  css?: string;
  appearance?: 'light' | 'dark' | 'auto';
  [key: string]: unknown;
}

// Term config types
export interface TermConfig {
  promptId?: string;
  command?: string;
  cwd?: string;
  env?: Record<string, string>;
  shell?: string | boolean;
  args?: string[];
  closeOnExit?: boolean;
  pid?: number;
  [key: string]: unknown;
}

// IPC message types
export interface IPCMessage {
  channel: string;
  pid?: number;
  value?: unknown;
  messageId?: string;
}

// State change callback
export type StateChangeCallback<T> = (newValue: T, prevValue: T) => void;

// Choice with preview
export interface ChoiceWithPreview extends Choice {
  preview?: string;
  hasPreview?: boolean;
  skip?: boolean;
}
