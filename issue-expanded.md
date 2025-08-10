This file is a merged representation of a subset of the codebase, containing specifically included files, combined into a single document by Repomix.
The content has been processed where content has been compressed (code blocks are separated by ⋮---- delimiter).

# File Summary

## Purpose
This file contains a packed representation of a subset of the repository's contents that is considered the most important context.
It is designed to be easily consumable by AI systems for analysis, code review,
or other automated processes.

## File Format
The content is organized as follows:
1. This summary section
2. Repository information
3. Directory structure
4. Repository files (if enabled)
5. Multiple file entries, each consisting of:
  a. A header with the file path (## File: path/to/file)
  b. The full contents of the file in a code block

## Usage Guidelines
- This file should be treated as read-only. Any changes should be made to the
  original repository files, not this packed version.
- When processing this file, use the file path to distinguish
  between different files in the repository.
- Be aware that this file may contain sensitive information. Handle it with
  the same level of security as you would the original repository.

## Notes
- Some files may have been excluded based on .gitignore rules and Repomix's configuration
- Binary files are not included in this packed representation. Please refer to the Repository Structure section for a complete list of file paths, including binary files
- Only files matching these patterns are included: src/renderer/src/jotai.ts, src/renderer/src/state/atoms/**
- Files matching patterns in .gitignore are excluded
- Files matching default ignore patterns are excluded
- Content has been compressed - code blocks are separated by ⋮---- delimiter
- Files are sorted by Git change count (files with more changes are at the bottom)

# Directory Structure
```
src/
  renderer/
    src/
      state/
        atoms/
          actions.ts
          app-core.ts
          bounds.ts
          cache.ts
          chat.ts
          choices.ts
          editor.ts
          form.ts
          index.ts
          input.ts
          ipc.ts
          lifecycle.ts
          log.ts
          media.ts
          preview.ts
          script-state.ts
          scrolling.ts
          tabs.ts
          terminal.ts
          theme.ts
          ui-elements.ts
          ui.ts
          utils.ts
      jotai.ts
```

# Files

## File: src/renderer/src/state/atoms/chat.ts
```typescript
/**
 * Chat state atoms.
 * State specific to the chat component.
 */
⋮----
import { atom } from 'jotai';
import type { MessageType } from 'react-chat-elements';
import { createLogger } from '../../log-utils';
⋮----
type MessageTypeWithIndex = MessageType & { index: number };
⋮----
// Ensure indices are set
⋮----
// Append token to the last message
⋮----
// Reset if something goes fundamentally wrong with the structure
⋮----
// Handle negative indexing (e.g., -1 is the last message)
⋮----
// Will be wired to channel later
```

## File: src/renderer/src/state/atoms/form.ts
```typescript
/**
 * Form and component state atoms.
 * These atoms manage form data, textarea configuration, and splash screen state.
 */
⋮----
import { atom } from 'jotai';
import type { TextareaConfig } from '@johnlindquist/kit/types/kitapp';
⋮----
// --- Textarea ---
⋮----
// --- Form ---
⋮----
// --- Splash Screen ---
```

## File: src/renderer/src/state/atoms/input.ts
```typescript
/**
 * Input state atoms.
 * Manages user input, modifiers, and focus state.
 */
⋮----
import { atom } from 'jotai';
import { createLogger } from '../../log-utils';
⋮----
// --- Core Input State ---
⋮----
// --- Input While Submitted ---
⋮----
// --- Modifiers and Key State ---
⋮----
// Will use constant from constants file later
⋮----
// --- Focus and Interaction ---
⋮----
// Requires a small amount of movement (5 units) before enabling mouse interaction
⋮----
// --- Direction for navigation ---
```

## File: src/renderer/src/state/atoms/log.ts
```typescript
/**
 * Log state atoms.
 * Manages application logs and console output display.
 */
⋮----
import { atom } from 'jotai';
import Convert from 'ansi-to-html';
import { drop as _drop } from 'lodash-es';
import { Channel } from '@johnlindquist/kit/core/enum';
⋮----
// --- Log Lines ---
⋮----
// --- Log Appending ---
⋮----
// Keep a maximum number of log lines, dropping the oldest if necessary
⋮----
// --- ANSI to HTML Converter ---
⋮----
// Will be properly implemented with theme dependency later
```

## File: src/renderer/src/state/atoms/media.ts
```typescript
/**
 * Media state atoms for audio, speech, microphone, and webcam.
 * These atoms manage multimedia input/output functionality.
 */
⋮----
import { atom } from 'jotai';
import { createLogger } from '../../log-utils';
⋮----
// --- Audio Playback ---
type AudioOptions = {
  filePath: string;
  playbackRate?: number;
};
⋮----
// --- Speech Synthesis ---
type SpeakOptions = {
  text: string;
  name?: string;
} & Partial<SpeechSynthesisUtterance>;
⋮----
// --- Microphone ---
⋮----
// --- Webcam ---
```

## File: src/renderer/src/state/atoms/scrolling.ts
```typescript
/**
 * Scrolling and list navigation atoms.
 * These atoms manage virtual list scrolling and item navigation.
 */
⋮----
import { atom } from 'jotai';
import type { VariableSizeList } from 'react-window';
⋮----
// Temporary - will be moved when gridReadyAtom is properly placed
```

## File: src/renderer/src/state/atoms/theme.ts
```typescript
/**
 * Theme and appearance atoms.
 * These atoms manage the application's visual theme and color scheme.
 */
⋮----
import { atom } from 'jotai';
⋮----
type Appearance = 'light' | 'dark' | 'auto';
```

## File: src/renderer/src/state/atoms/app-core.ts
```typescript
/**
 * Core application state, configuration, and process management atoms.
 * These atoms handle the fundamental app configuration and lifecycle states.
 */
⋮----
import type { UserDb } from '@johnlindquist/kit/core/db';
import type { ProcessInfo } from '@johnlindquist/kit/types/core';
import { atom } from 'jotai';
⋮----
// --- Configuration and Environment ---
⋮----
// --- Process and Execution State ---
⋮----
export const getPid = ()
⋮----
// --- Application Lifecycle and Visibility ---
⋮----
const isReady = atom(true); // Used primarily for the Splash screen
⋮----
// --- Caching ---
```

## File: src/renderer/src/state/atoms/bounds.ts
```typescript
/**
 * Bounds and resize state atoms.
 * Manages window bounds, resizing, and layout calculations.
 */
⋮----
import { atom } from 'jotai';
// Using Rectangle type from shared types to avoid electron import
type Rectangle = { x: number; y: number; width: number; height: number; };
import { PROMPT } from '@johnlindquist/kit/core/enum';
import { createLogger } from '../../log-utils';
import { itemHeightAtom, inputHeightAtom } from './ui-elements';
⋮----
// --- Bounds and Position ---
⋮----
// --- Resizing State ---
⋮----
// --- Font Size Atoms (Dynamic based on heights) ---
```

## File: src/renderer/src/state/atoms/cache.ts
```typescript
/**
 * Caching atoms for main script state.
 * These atoms store cached data to improve performance when switching between scripts.
 */
⋮----
import type { PromptData, FlagsObject, Shortcut } from '@johnlindquist/kit/types/core';
import type { ScoredChoice } from '../../../../shared/types';
import { UI } from '@johnlindquist/kit/core/enum';
import { atom } from 'jotai';
```

## File: src/renderer/src/state/atoms/editor.ts
```typescript
/**
 * Editor state atoms.
 * State specific to the Monaco editor component.
 */
⋮----
import { atom } from 'jotai';
import type { editor } from 'monaco-editor';
import type { EditorConfig, EditorOptions } from '@johnlindquist/kit/types/kitapp';
import { findCssVar } from '../../../../shared/color-utils';
⋮----
// Destructure to separate options for Monaco from other configurations
⋮----
// Atom specifically for triggering an append action in the editor component
⋮----
// --- Editor History ---
⋮----
// --- Editor Theme ---
```

## File: src/renderer/src/state/atoms/index.ts
```typescript
/**
 * Central export file for all modularized atoms.
 * This file re-exports all atoms from their respective modules.
 */
⋮----
// Core application atoms
⋮----
// UI and theme atoms
⋮----
// Input and interaction atoms
⋮----
// Choice management atoms
⋮----
// Actions and flags atoms
⋮----
// Component-specific atoms
⋮----
// IPC and utilities
```

## File: src/renderer/src/state/atoms/script-state.ts
```typescript
/**
 * State related to the currently executing script.
 * These atoms track script information, state, and derived properties.
 */
⋮----
import type { Script } from '@johnlindquist/kit/types/core';
import { atom } from 'jotai';
import { SPLASH_PATH, noScript } from '../../../../shared/defaults';
import { kitConfigAtom, appConfigAtom } from './app-core';
import { createLogger } from '../../log-utils';
```

## File: src/renderer/src/state/atoms/tabs.ts
```typescript
/**
 * Tab navigation atoms.
 * These atoms manage tab state and navigation.
 */
⋮----
import { atom } from 'jotai';
import { isEqual } from 'lodash-es';
⋮----
// export const tabIndexAtom = atom(
//   (g) => g(_tabIndex),
//   (_g, s, a: number) => {
//     // Will be properly implemented after all dependencies are extracted
//     s(_tabIndex, a);
//   },
// ); // Complex version with computed properties is in jotai.ts
```

## File: src/renderer/src/state/atoms/terminal.ts
```typescript
/**
 * Terminal state atoms.
 * These atoms manage the terminal emulator configuration and output.
 */
⋮----
import { atom } from 'jotai';
import type { TermConfig } from '../../../../shared/types';
⋮----
// Append output
```

## File: src/renderer/src/state/atoms/utils.ts
```typescript
/**
 * Utility atoms and helper functions.
 * Miscellaneous utility atoms that don't fit in other categories.
 */
⋮----
import { atom } from 'jotai';
import { AppChannel } from '../../../../shared/enums';
import type { ResizeData, FilePathBounds } from '../../../../shared/types';
⋮----
// --- Search and UI State ---
⋮----
// --- Mini Shortcuts ---
⋮----
// This feature was explicitly disabled in the original code
⋮----
// --- File Path Bounds ---
⋮----
// --- Asset Creation ---
export const createAssetAtom = (...parts: string[])
⋮----
// --- Process Management ---
```

## File: src/renderer/src/state/atoms/choices.ts
```typescript
/**
 * Choice management atoms.
 * Handles choices, filtering, indexing, and selection.
 */
⋮----
import type { Choice } from '@johnlindquist/kit/types/core';
import type { ScoredChoice } from '../../../../shared/types';
import { atom } from 'jotai';
import { noChoice } from '../../../../shared/defaults';
import { arraysEqual } from '../../utils/state-utils';
⋮----
// --- Core Choices State ---
⋮----
// Configuration for how choices are loaded
⋮----
// Export the choices atom for read-only access
// export const scoredChoicesAtom = atom((g) => g(choices)); // Complex version with computed properties is in jotai.ts
⋮----
// --- Choice Heights ---
⋮----
// --- Choice Selection and Indexing ---
⋮----
// Note: indexAtom is defined in jotai.ts with more complex logic
⋮----
// --- Skip State ---
⋮----
// --- Focused Choice ---
// Enhanced focused choice atom with better error handling and initialization safety
⋮----
// Ensure we never return null/undefined - always return a valid Choice object
⋮----
// Setter: validate the choice being set and ensure it's never null/undefined
⋮----
// export const focusedChoiceAtom = atom((g) => g(_focused)); // Complex version with computed properties is in jotai.ts
⋮----
// --- Multiple Selection ---
⋮----
// --- Choice Inputs (for Scriptlets/Dynamic Inputs) ---
type ChoiceInputId = string;
⋮----
// Utilities will be moved to index when wiring everything together
⋮----
// Temporary exports for setter atoms that will be properly wired later
⋮----
const itemHeight = 32; // Will be imported from proper place later
```

## File: src/renderer/src/state/atoms/ipc.ts
```typescript
/**
 * IPC and channel communication atoms.
 * Handles inter-process communication with the main process.
 */
⋮----
import { atom } from 'jotai';
import { Channel } from '@johnlindquist/kit/core/enum';
import { AppChannel } from '../../../../shared/enums';
import type { AppState, AppMessage, Survey } from '@johnlindquist/kit/types/core';
import type { ResizeData } from '../../../../shared/types';
import { createLogger } from '../../log-utils';
⋮----
// --- Channel State ---
⋮----
// --- Submission State ---
⋮----
// export const submitValueAtom = atom((g) => g(_submitValue)); // Complex version with computed properties is in jotai.ts
⋮----
// --- Shortcodes ---
type OnInputSubmit = { [key: string]: any };
⋮----
type OnShortcut = { [key: string]: any };
⋮----
// --- IPC Actions ---
// export const runMainScriptAtom = atom(() => () => {
//   ipcRenderer.send(AppChannel.RUN_MAIN_SCRIPT);
// }); // Complex version with computed properties is in jotai.ts
⋮----
type levelType = 'debug' | 'info' | 'warn' | 'error' | 'silly';
```

## File: src/renderer/src/state/atoms/lifecycle.ts
```typescript
/**
 * Application lifecycle atoms for open/close state management.
 * These atoms handle the app window visibility lifecycle.
 */
⋮----
import { atom } from 'jotai';
import { pidAtom } from './app-core';
import { mouseEnabledAtom } from './input';
⋮----
// This will be properly implemented after extracting all dependencies
// export const openAtom = atom(
//   (g) => g(_open),
//   (g, s, a: boolean) => {
//     if (g(_open) === a) return;
//
//     s(mouseEnabledAtom, 0);
//
//     // TODO: Will add reset logic after all atoms are extracted
//     if (g(_open) && a === false) {
//       // resetPromptState will be added here
//     }
//     s(_open, a);
//   },
// ); // Complex version with computed properties is in jotai.ts
⋮----
// export const exitAtom = atom(
//   (g) => g(openAtom),
//   (g, s, pid: number) => {
//     if (g(pidAtom) === pid) {
//       s(openAtom, false);
//     }
//   },
// ); // Complex version with computed properties is in jotai.ts
```

## File: src/renderer/src/state/atoms/actions.ts
```typescript
/**
 * Actions and flags state atoms.
 * Manages actions menu, flags, and keyboard shortcuts.
 */
⋮----
import type { Action, FlagsObject, Shortcut, ActionsConfig, Choice } from '@johnlindquist/kit/types/core';
import type { ScoredChoice } from '../../../../shared/types';
import { atom } from 'jotai';
import { isEqual } from 'lodash-es';
import { unstable_batchedUpdates } from 'react-dom';
import { createLogger } from '../../log-utils';
⋮----
// --- Flags Configuration ---
⋮----
// Exclude internal properties when reading flags
⋮----
// --- Actions Menu State ---
⋮----
// export const flaggedChoiceValueAtom = atom((g) => g(_flaggedValue)); // Complex version with computed properties is in jotai.ts
⋮----
// --- Actions Input ---
⋮----
// --- Scored Flags/Actions ---
⋮----
// export const scoredFlagsAtom = atom((g) => g(scoredFlags)); // Complex version with computed properties is in jotai.ts
⋮----
// --- Actions Indexing and Focus ---
⋮----
// export const flagsIndexAtom = atom((g) => g(flagsIndex)); // Complex version with computed properties is in jotai.ts
⋮----
// --- Shortcuts ---
⋮----
// --- Actions Configuration ---
⋮----
// Derived atoms defined in jotai.ts
// export const hasActionsAtom = atom(() => false);
// export const actionsAtom = atom(() => [] as Action[]);
// export const preventSubmitWithoutActionAtom = atom(() => false);
// export const actionsPlaceholderAtom = atom(() => 'Actions');
⋮----
// Setter atoms for later wiring
```

## File: src/renderer/src/state/atoms/ui-elements.ts
```typescript
/**
 * UI element state atoms.
 * These atoms manage state for various UI components and their visibility.
 */
⋮----
import { atom } from 'jotai';
import { PROMPT } from '@johnlindquist/kit/core/enum';
⋮----
// --- UI Element Visibility ---
⋮----
// --- Component Heights ---
⋮----
// Internal primitive atom for mainHeight
⋮----
// mainHeightAtom is defined in jotai.ts with complex setter logic
⋮----
// --- UI Text and Labels ---
⋮----
// --- Grid and Layout ---
```

## File: src/renderer/src/state/atoms/ui.ts
```typescript
/**
 * UI state atoms.
 * Manages the current UI mode and related states.
 */
⋮----
import { atom } from 'jotai';
import { UI, Mode } from '@johnlindquist/kit/core/enum';
import type { PromptData } from '@johnlindquist/kit/types/core';
⋮----
// --- Core UI State ---
⋮----
// export const uiAtom = atom((g) => g(_ui)); // Complex version with computed properties is in jotai.ts
⋮----
// --- Prompt Data ---
⋮----
// export const promptDataAtom = atom((g) => g(promptData)); // Complex version with computed properties is in jotai.ts
⋮----
// --- Show/Hide States ---
// showSelectedAtom defined in jotai.ts (derived atom)
// showTabsAtom defined in jotai.ts (derived atom)
⋮----
// --- Other UI-related atoms ---
// isMainScriptInitialAtom defined in jotai.ts (derived atom)
// export const choicesConfigAtom = atom(
//   () => ({ preload: false }),
//   (_g, _s, _a: { preload: boolean }) => {}
// ); // Complex version with computed properties is in jotai.ts
```

## File: src/renderer/src/state/atoms/preview.ts
```typescript
/**
 * Preview and panel state atoms.
 * Manages preview panel content and visibility.
 */
⋮----
import { atom } from 'jotai';
import DOMPurify from 'dompurify';
import { closedDiv } from '../../../../shared/defaults';
import { promptData } from './ui';
import { _mainHeight } from './ui-elements';
import { loadingAtom, isHiddenAtom } from './app-core';
import { ID_PANEL, ID_LIST } from '../dom-ids';
⋮----
// --- Preview HTML ---
⋮----
// Sanitize HTML content, allowing iframes and unknown protocols
⋮----
// Check if the preview should be visible
⋮----
// closedDiv ('<div></div>') should be treated as no preview
⋮----
// --- Panel HTML ---
⋮----
// If panel is set, ensure preview is closed unless explicitly defined in prompt data
⋮----
// Adjust main height if the panel is cleared and no list is present
```

## File: src/renderer/src/jotai.ts
```typescript
/// <reference path="./env.d.ts" />
⋮----
/**
 * Central Jotai state management file.
 * This file now imports modularized atoms and provides complex wiring logic.
 * Goal: Keep this file under 1000 lines by delegating to modular atoms.
 */
⋮----
// =================================================================================================
// IMPORTS
// =================================================================================================
⋮----
import { Channel, Mode, PROMPT, UI } from '@johnlindquist/kit/core/enum';
import type {
  Action,
  AppState,
  Choice,
  FlagsWithKeys,
  PromptData,
  Script,
} from '@johnlindquist/kit/types/core';
import type {
  AppMessage,
} from '@johnlindquist/kit/types/kitapp';
import { type Getter, type Setter, atom } from 'jotai';
import { debounce, throttle } from 'lodash-es';
import { unstable_batchedUpdates } from 'react-dom';
⋮----
// Import all modularized atoms
⋮----
// Import specific atoms we need to wire
import {
  _open,
  _script,
  _inputAtom,
  _inputChangedAtom,
  _flaggedValue,
  _panelHTML,
  _previewHTML,
  _tabIndex,
  _focused,
  _modifiers,
  _lastKeyDownWasModifierAtom,
  _actionsInputAtom,
  _termOutputAtom,
  _chatMessagesAtom,
  _miniShortcutsHoveredAtom,
  _submitValue,
  _indexAtom,
  cachedMainScoredChoicesAtom,
  cachedMainPromptDataAtom,
  cachedMainPreviewAtom,
  cachedMainShortcutsAtom,
  cachedMainFlagsAtom,
  promptData,
  promptReadyAtom,
  choicesReadyAtom,
  choicesConfig,
  prevChoicesConfig,
  choices,
  prevScoredChoicesIdsAtom,
  scoredChoicesAtom,
  choicesAtom,
  selectedChoicesAtom,
  flagsAtom,
  scoredFlags,
  flagsIndex,
  focusedFlagValueAtom,
  focusedActionAtom,
  shortcutsAtom,
  _ui,
  modeAtom,
  enterAtom,
  nameAtom,
  descriptionAtom,
  tabsAtom,
  previewHTMLAtom,
  panelHTMLAtom,
  formHTMLAtom,
  logHTMLAtom,
  logLinesAtom,
  termConfigAtom,
  editorConfigAtom,
  editorCursorPosAtom,
  editorHistory,
  webcamStreamAtom,
  pidAtom,
  processingAtom,
  runningAtom,
  submittedAtom,
  loadingAtom,
  progressAtom,
  isHiddenAtom,
  promptActiveAtom,
  mouseEnabledAtom,
  resizeCompleteAtom,
  audioDotAtom,
  disableSubmitAtom,
  pauseChannelAtom,
  kitConfigAtom,
  appConfigAtom,
  themeAtom,
  tempThemeAtom,
  itemHeightAtom,
  inputHeightAtom,
  _mainHeight,
  choicesHeightAtom,
  flagsHeightAtom,
  actionsItemHeightAtom,
  gridReadyAtom,
  listAtom,
  flagsListAtom,
  scrollToIndexAtom,
  requiresScrollAtom,
  promptBoundsAtom,
  isWindowAtom,
  justOpenedAtom,
  isSplashAtom,
  isMainScriptAtom,
  defaultChoiceIdAtom,
  defaultValueAtom,
  prevIndexAtom,
  directionAtom,
  hasSkipAtom,
  allSkipAtom,
  flaggedChoiceValueAtom,
  actionsInputAtom,
  flagsIndexAtom,
  hasActionsAtom,
  actionsAtom,
  preventSubmitWithoutActionAtom,
  inputAtom,
  inputFocusAtom,
  hintAtom,
  placeholderAtom,
  selectedAtom,
  tabChangedAtom,
  inputWhileSubmittedAtom,
  lastKeyDownWasModifierAtom,
  enterLastPressedAtom,
  closedInput,
  lastScriptClosed,
  logoAtom,
  preloadedAtom,
  backToMainAtom,
  choiceInputsAtom,
  editorAppendAtom,
  editorHistoryPush,
  termOutputAtom,
  formDataAtom,
  footerAtom,
  containerClassNameAtom,
  headerHiddenAtom,
  footerHiddenAtom,
  actionsConfigAtom,
  onInputSubmitAtom,
  defaultActionsIdAtom,
  hasRightShortcutAtom,
  showSelectedAtom,
  showTabsAtom,
  previewEnabledAtom,
  previewCheckAtom,
  promptResizedByHumanAtom,
  scrollToItemAtom,
  flagsRequiresScrollAtom,
  topHeightAtom,
  currentChoiceHeightsAtom,
  prevMh,
  toggleSelectedChoiceAtom,
  toggleAllSelectedChoicesAtom,
  actionsPlaceholderAtom,
  isMainScriptInitialAtom,
  cachedAtom,
  clearCacheAtom,
  submitValueAtom,
  submitInputAtom,
  escapeAtom,
  blurAtom,
  sendShortcutAtom,
  sendActionAtom,
  triggerKeywordAtom,
  valueInvalidAtom,
  preventSubmitAtom,
  changeAtom,
  runMainScriptAtom,
  initPromptAtom,
  enterButtonNameAtom,
  enterButtonDisabledAtom,
  shortcutStringsAtom,
  onPasteAtom,
  onDropAtom,
  colorAtom,
  resize,
  listProcessesActionAtom,
  signInActionAtom,
  actionsButtonActionAtom,
  shouldActionButtonShowOnInputAtom,
} from './state/atoms';
⋮----
// Shared imports
import { DEFAULT_HEIGHT, closedDiv, noChoice } from '../../shared/defaults';
import { AppChannel } from '../../shared/enums';
import type { ScoredChoice, TermConfig as SharedTermConfig, Choice } from '../../shared/types';
import { formatShortcut } from './components/formatters';
import { createLogger } from './log-utils';
import { arraysEqual, colorUtils, dataUtils, domUtils } from './utils/state-utils';
import { removeTopBorderOnFirstItem, calcVirtualListHeight } from './state/utils';
import { advanceIndexSkipping } from './state/skip-nav';
// computeResize removed - now handled by ResizeController
⋮----
// --- START FIX: Initialization Safety ---
⋮----
// Define a hardcoded fallback structure locally.
⋮----
// Verify the import and select the safe fallback at module initialization time.
⋮----
// --- END FIX ---
import {
  SCROLL_THROTTLE_MS,
  PREVIEW_THROTTLE_MS,
  RESIZE_DEBOUNCE_MS,
  JUST_OPENED_MS,
  PROCESSING_SPINNER_DELAY_MS,
  MAX_VLIST_HEIGHT,
  MAX_TABCHECK_ATTEMPTS,
} from './state/constants';
import {
  ID_MAIN,
  ID_LIST,
  ID_PANEL,
  ID_WEBCAM,
  ID_LOG,
} from './state/dom-ids';
⋮----
// =================================================================================================
// COMPLEX WIRING LOGIC
// This section contains the complex atom wiring that couldn't be easily extracted
// =================================================================================================
⋮----
// prevTopHeight removed - now handled by ResizeController
⋮----
// --- Open/Close Lifecycle with Reset ---
⋮----
// Reset prompt state on close
⋮----
// Cleanup media streams
⋮----
// --- Script Atom with Complex Logic ---
⋮----
// --- PromptData Atom with Complex State Management ---
⋮----
// Clear loading timeout when new prompt opens
⋮----
// Match main branch behavior exactly - only set panel if a.panel exists
⋮----
// --- Input Atom with Complex Logic ---
⋮----
// Trigger state update for ResizeController to detect input cleared
⋮----
// --- Choices Configuration ---
⋮----
// --- Tab Index ---
⋮----
const getSendTabChanged = (g: Getter)
⋮----
// --- UI Atom ---
⋮----
// --- Scored Choices with Complex Logic ---
⋮----
// Focus and scroll logic is now handled by FocusController
// This atom only manages the choice list data
⋮----
// Only send NO_CHOICES channel message when needed
⋮----
// Adjust main height based on UI mode
⋮----
// --- Index Atom with Skip Logic ---
⋮----
// --- Focused Choice with Throttling ---
⋮----
// --- Flagged Choice Value ---
⋮----
// Trigger state update for ResizeController to detect flag value change
⋮----
// --- Scored Flags ---
⋮----
// --- Flags Index ---
⋮----
// --- Resize Logic ---
// The resize logic has been moved to ResizeController
// This atom is kept for compatibility but now just triggers a state change
// that the ResizeController will react to
⋮----
// Force a state update that ResizeController will detect
// This is a temporary compatibility layer
⋮----
// Trigger state update for ResizeController to detect
⋮----
// Simple mainHeightAtom without side-effects - resize is handled by ResizeController
⋮----
// Prevent setting height to 0 if content (panel or choices) exists
⋮----
// --- Channel Communication ---
⋮----
const state = g(appStateAtom); // Read the full state
⋮----
// CRITICAL FIX: Ensure 'focused' is never undefined/null after override
⋮----
// --- App State Aggregation ---
⋮----
focused: g(_focused) || safeNoChoice,  // Use the validated safeNoChoice
⋮----
// --- Submit Value ---
const checkSubmitFormat = (g: Getter, checkValue: any) =>
⋮----
// Use the choice-specific 'enter' label or the global one
⋮----
if (g(flaggedChoiceValueAtom)) return false; // Usually enabled when actions menu is open
⋮----
// If strict mode is on, disable if no choice is focused
⋮----
// Filter out actions that are already defined as shortcuts to avoid duplication
⋮----
// If 'enter' is pressed and not defined as a specific shortcut, treat it as a submission trigger (tracked via time)
⋮----
// Otherwise, send it as a shortcut event.
⋮----
// Stop any ongoing speech synthesis
⋮----
// @ts-ignore -- EyeDropper API might not be in standard TS types yet
⋮----
// User cancelled or EyeDropper failed
⋮----
// hintAtom setter handles the ANSI conversion
⋮----
// =================================================================================================
// DERIVED ATOMS
// These atoms depend on the wired state and must be defined here.
// =================================================================================================
⋮----
// --- UI State ---
⋮----
// Re-export from selector to maintain compatibility
⋮----
// --- Actions State ---
⋮----
// Actions exist if there are global flags or the focused choice has specific actions
⋮----
// Merges flags and shortcuts into a unified list of actions for display
⋮----
const disabled = g(flaggedChoiceValueAtom); // Disabled if the actions menu is already open
⋮----
// Submit should be prevented when actions menu is open without a selected action
⋮----
// --- Utility Actions ---
⋮----
// --- Missing atoms that are referenced but not defined ---
⋮----
// Restore state from cache atomically to prevent flicker
⋮----
// Trigger state update for ResizeController to detect top height change
⋮----
event.preventDefault(); // Assuming we want to handle paste manually or let Monaco handle it, but the original had this.
⋮----
if (g(uiAtom) === UI.drop) return; // UI.drop likely has its own specific handler
⋮----
// Export remaining helper functions and constants for compatibility
```
