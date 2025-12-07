/**
 * IPromptContext - Interface for prompt context used by utility/helper files.
 *
 * This interface defines the contract between KitPrompt and the various
 * utility files (prompt.window-flow.ts, prompt.resize-listeners.ts, etc.)
 * to avoid circular dependency issues while maintaining type safety.
 *
 * By accepting IPromptContext instead of KitPrompt, helper files no longer
 * need to import KitPrompt directly, breaking the circular import chain.
 */

import type { UI } from '@johnlindquist/kit/core/enum';
import type { PromptData, Script } from '@johnlindquist/kit/types/core';
import type { BrowserWindow, Rectangle } from 'electron';

/**
 * Core prompt context interface containing properties and methods
 * needed by utility files to operate on a prompt without importing KitPrompt.
 */
export interface IPromptContext {
  // ─────────────────────────────────────────────────────────────────
  // Window & Identification
  // ─────────────────────────────────────────────────────────────────
  /** The Electron BrowserWindow instance */
  window: BrowserWindow;
  /** Unique identifier for this prompt instance */
  id: string;
  /** Process ID associated with this prompt */
  pid: number;

  // ─────────────────────────────────────────────────────────────────
  // Script & State
  // ─────────────────────────────────────────────────────────────────
  /** Current UI mode (arg, term, editor, etc.) */
  ui: UI;
  /** Path to the currently running script */
  scriptPath: string;
  /** Name of the current script (derived from scriptPath) */
  readonly scriptName: string;
  /** Whether this prompt is showing the main menu */
  readonly isMainMenu: boolean;
  /** The script metadata object */
  script?: Script;
  /** Current prompt data configuration */
  promptData: PromptData | null;

  // ─────────────────────────────────────────────────────────────────
  // Window Mode & Behavior
  // ─────────────────────────────────────────────────────────────────
  /** Current window mode: 'panel' or 'window' */
  windowMode: 'panel' | 'window';
  /** Whether resize operations are allowed */
  allowResize: boolean;
  /** Whether a resize operation is in progress */
  resizing: boolean;
  /** Whether this is the first prompt display */
  firstPrompt: boolean;
  /** Whether the window has been modified by user interaction */
  modifiedByUser: boolean;
  /** Whether bounds are locked during resize operations */
  boundsLockedForResize: boolean;

  // ─────────────────────────────────────────────────────────────────
  // Long-Running Script Monitoring
  // ─────────────────────────────────────────────────────────────────
  /** Timestamp when the script started running */
  scriptStartTime?: number;
  /** Whether the long-running notification has been shown */
  hasShownLongRunningNotification?: boolean;
  /** Timer for long-running script monitoring */
  longRunningTimer?: NodeJS.Timeout;
  /** Threshold in milliseconds before showing long-running notification */
  longRunningThresholdMs: number;

  // ─────────────────────────────────────────────────────────────────
  // Internal State Flags
  // ─────────────────────────────────────────────────────────────────
  /** Whether user data has been bootstrapped to this prompt */
  __userBootstrapped?: boolean;
  /** Whether emoji picker is active */
  emojiActive?: boolean;
  /** Timeout for top-level operations */
  topTimeout?: NodeJS.Timeout;

  // ─────────────────────────────────────────────────────────────────
  // Methods - Window Control
  // ─────────────────────────────────────────────────────────────────
  /** Set window bounds with an optional reason for logging */
  setBounds(bounds: Partial<Rectangle>, reason?: string): void;
  /** Hide the window immediately */
  hideInstant(): void;
  /** Actually hide the window (internal) */
  actualHide(): void;
  /** Focus the prompt window */
  focusPrompt(): void;
  /** Toggle window mode between panel and window */
  toggleWindowMode(): Promise<void>;
  /** Clear the long-running monitor timer */
  clearLongRunningMonitor(): void;

  // ─────────────────────────────────────────────────────────────────
  // Methods - Logging
  // ─────────────────────────────────────────────────────────────────
  /** Log info level message */
  logInfo(...args: unknown[]): void;
  /** Log warning level message */
  logWarn(...args: unknown[]): void;
  /** Log error level message */
  logError(...args: unknown[]): void;
  /** Log verbose level message */
  logVerbose(...args: unknown[]): void;

  // ─────────────────────────────────────────────────────────────────
  // Methods - IPC Communication
  // ─────────────────────────────────────────────────────────────────
  /** Send a message to the prompt renderer process */
  sendToPrompt(channel: unknown, data?: unknown): void;

  // ─────────────────────────────────────────────────────────────────
  // Methods - Bounds Management
  // ─────────────────────────────────────────────────────────────────
  /** Save the current prompt bounds to cache */
  saveCurrentPromptBounds(): void;
}
