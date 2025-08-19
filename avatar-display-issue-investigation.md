# Issue Investigation Report

## Issue Summary
The user avatar is not displaying correctly in the Script Kit app. After signing in, the avatar shows briefly but then disappears when opening new browser windows. The caching system that was implemented doesn't seem to be working properly across multiple window creations.

## Investigation Findings

### Root Cause Analysis
1. **Timing Issue**: User data arrives after avatar rendering logic executes
   - In `App.tsx` line 509, `userChangedHandler` sets user data via IPC
   - Avatar component in `input.tsx` line 618 checks `user.login && user.avatar_url` 
   - When window first loads, `userAtom` starts as `{}` (app-core.ts line 29)

2. **Multiple User Data Send Points**: 
   - `watcher.ts` line 594: `sendToAllPrompts(AppChannel.USER_CHANGED, user)` (global)
   - `prompt.set-prompt-data.ts` line 97: Early user data send during prompt setup
   - `prompt.init-utils.ts` line 69: User data send on `did-finish-load`

3. **Cache Implementation Present But Not Working**:
   - Avatar cache exists in `avatar-cache.ts` with proper file caching
   - Renderer cache utility in `image-cache.ts` with `useCachedAvatar` hook
   - But avatar still disappears on new window creation

4. **IPC Flow Issue**: 
   - User data is sent multiple times but timing is inconsistent
   - New windows don't receive cached user data immediately
   - `userAtom` initializes empty, causing avatar to not render until data arrives

### Affected Components
- **Avatar Display**: `input.tsx` lines 618-624 (conditional rendering based on user.login)
- **User Data Flow**: `watcher.ts` checkUserDb function (lines 555-594)
- **IPC Communication**: Multiple send points creating race conditions
- **State Management**: `userAtom` initialization and updates

### Cache System Status
- **Main Process Cache**: Implemented in `avatar-cache.ts` - appears functional
- **Renderer Cache**: Implemented in `image-cache.ts` with memory + IPC fallback
- **Cache Hook**: `useCachedAvatar` properly implemented in input.tsx line 462
- **Issue**: User data timing prevents cache from being utilized effectively

## Relevant Files Included
- `input.tsx`: Avatar display logic and conditional rendering
- `watcher.ts`: User data loading and broadcasting to prompts
- `App.tsx`: IPC listener for USER_CHANGED events  
- `avatar-cache.ts`: Main process persistent avatar cache
- `image-cache.ts`: Renderer process cache utilities and useCachedAvatar hook
- `prompt.set-prompt-data.ts`: Early user data sending during prompt initialization
- `prompt.init-utils.ts`: User data sending on window finish load
- `app-core.ts`: userAtom definition (initializes as empty object)
- `enums.ts`: AppChannel.USER_CHANGED definition
- `avatarCache.ts`: Effect for preloading avatar when user data changes

## Recommended Next Steps

### Immediate Fixes
1. **Fix Initial User Data Timing**:
   - Ensure user data is sent before window shows (not after did-finish-load)
   - Consider sending cached user data synchronously during window creation
   - Move user data send to earlier in prompt initialization pipeline

2. **Consolidate User Data Sending**:
   - Remove duplicate USER_CHANGED sends 
   - Ensure single source of truth for user data broadcasting
   - Fix race condition between multiple send points

3. **Improve Avatar Cache Utilization**:
   - Preload avatar data during app startup
   - Ensure cache works across window creations
   - Add fallback to cached data when user data is temporarily empty

### Investigation Areas
1. **Check user.json loading timing**: Why does getUserJson() sometimes return {} initially?
2. **Verify IPC message ordering**: Are USER_CHANGED messages arriving in expected order?
3. **Test cache persistence**: Does avatar cache survive window recreation?
4. **Validate atom initialization**: Should userAtom initialize with cached data instead of {}?

### Testing Strategy  
1. Add logging to track user data flow timing across window creation
2. Verify avatar cache retrieval during window initialization
3. Test avatar display with network delays to simulate real conditions
4. Confirm cache works when multiple windows are opened rapidly

## Token Optimization
- Original scan: 39,899 tokens across 11 files
- Optimized bundle: 5,709 tokens across 10 core files  
- Reduction: 85.7% token reduction while maintaining all relevant context

---

This file is a merged representation of a subset of the codebase, containing specifically included files, combined into a single document by Repomix.
The content has been processed where comments have been removed, line numbers have been added, content has been compressed (code blocks are separated by ⋮---- delimiter).

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
- Only files matching these patterns are included: src/renderer/src/components/input.tsx, src/main/avatar-cache.ts, src/renderer/src/utils/image-cache.ts, src/main/prompt.set-prompt-data.ts, src/main/prompt.init-utils.ts, src/main/watcher.ts, src/renderer/src/state/atoms/app-core.ts, src/shared/enums.ts, src/renderer/src/App.tsx, src/renderer/src/effects/avatarCache.ts
- Files matching patterns in .gitignore are excluded
- Files matching default ignore patterns are excluded
- Code comments have been removed from supported file types
- Line numbers have been added to the beginning of each line
- Content has been compressed - code blocks are separated by ⋮---- delimiter
- Files are sorted by Git change count (files with more changes are at the bottom)

# Directory Structure
```
src/
  main/
    avatar-cache.ts
    prompt.init-utils.ts
    prompt.set-prompt-data.ts
    watcher.ts
  renderer/
    src/
      components/
        input.tsx
      effects/
        avatarCache.ts
      state/
        atoms/
          app-core.ts
      utils/
        image-cache.ts
      App.tsx
  shared/
    enums.ts
```

# Files

## File: src/main/avatar-cache.ts
```typescript
import { app } from 'electron';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import axios from 'axios';
import { mainLog } from './logs';
⋮----
interface CacheEntry {
  dataUrl: string;
  timestamp: number;
  url: string;
}
⋮----
async function ensureCacheDir()
⋮----
function getCacheFilePath(url: string): string
⋮----
export async function getCachedAvatar(avatarUrl: string): Promise<string | null>
⋮----
export async function clearAvatarCache(): Promise<void>
```

## File: src/main/watcher.ts
```typescript
import { existsSync, readdirSync } from 'node:fs';
import { lstat, readFile, readdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { getUserJson } from '@johnlindquist/kit/core/db';
import { Channel, Env } from '@johnlindquist/kit/core/enum';
import type { Script, Scriptlet } from '@johnlindquist/kit/types';
import { Notification, shell } from 'electron';
import { globby } from 'globby';
import { debounce } from 'lodash-es';
import { isEqual, omit } from 'lodash-es';
import madge, { type MadgeModuleDependencyGraph } from 'madge';
import { packageUp } from 'package-up';
import { snapshot } from 'valtio';
import { subscribeKey } from 'valtio/utils';
⋮----
import { getKenvFromPath, kenvPath, kitPath, parseScript, resolveToScriptPath } from '@johnlindquist/kit/core/utils';
⋮----
import chokidar, { type FSWatcher } from 'chokidar';
import { shortcutScriptChanged, unlinkShortcuts } from './shortcuts';
⋮----
import { backgroundScriptChanged, removeBackground } from './background';
import { cancelSchedule, scheduleScriptChanged } from './schedule';
import { debounceSetScriptTimestamp, kitState, sponsorCheck } from './state';
import { systemScriptChanged, unlinkEvents } from './system-events';
import { removeWatch, watchScriptChanged } from './watch';
⋮----
import { clearInterval, setInterval } from 'node:timers';
import { AppChannel, Trigger } from '../shared/enums';
import { KitEvent, emitter } from '../shared/events';
import { compareArrays, diffArrays } from '../shared/utils';
import { reloadApps } from './apps';
import { sendToAllPrompts } from './channel';
import { type WatchEvent, getWatcherManager, startWatching } from './chokidar';
import { pathExists, pathExistsSync, writeFile } from './cjs-exports';
import { actualHideDock, showDock } from './dock';
import { loadKenvEnvironment } from './env-utils';
import { isInDirectory } from './helpers';
import { cacheMainScripts, debounceCacheMainScripts } from './install';
import { runScript } from './kit';
import { getFileImports } from './npm';
import { kenvChokidarPath, kitChokidarPath, slash } from './path-utils';
import {
  clearIdleProcesses,
  ensureIdleProcess,
  sendToAllActiveChildren,
  spawnShebang,
  updateTheme,
} from './process';
import { setKitStateAtom } from './prompt';
import { clearPromptCache, clearPromptCacheFor } from './prompt.cache';
import { setCSSVariable } from './theme';
import { removeSnippet, snippetScriptChanged, addTextSnippet } from './tick';
⋮----
import { watcherLog as log, scriptLog } from './logs';
import { prompts } from './prompts';
import { createIdlePty } from './pty';
⋮----
const normalizePath = (filePath: string): string =>
⋮----
const wasRecentlyProcessed = (filePath: string): boolean =>
⋮----
const markFileAsProcessed = (filePath: string): void =>
⋮----
const unlinkScript = (filePath: string) =>
⋮----
const logAllEvents = () =>
⋮----
const logQueue = (event: WatchEvent, filePath: string) =>
⋮----
const unlinkBin = (filePath: string) =>
⋮----
const getDepWatcher = () =>
⋮----
function findEntryScripts(
  graph: MadgeModuleDependencyGraph,
  relativeDepPath: string,
  checkedScripts: Set<string> = new Set(),
): Set<string>
⋮----
function watchTheme()
⋮----
function shouldTimestampScript(_event: WatchEvent, rebuilt: boolean, _skipCacheMainMenu: boolean): boolean
⋮----
function timestampAndNotifyChildren(event: WatchEvent, script: Script)
⋮----
function handleNotReady(script: Script, _event: WatchEvent, rebuilt: boolean, skipCacheMainMenu: boolean)
⋮----
async function finalizeScriptChange(script: Script)
⋮----
function handleUnlinkEvent(script: Script)
⋮----
async function handleAddOrChangeEvent(event: WatchEvent, script: Script, rebuilt: boolean, skipCacheMainMenu: boolean)
⋮----
export const onScriptChanged = async (
  event: WatchEvent,
  script: Script,
  rebuilt = false,
  skipCacheMainMenu = false,
) =>
⋮----
export async function handleSnippetFileChange(eventName: WatchEvent, snippetPath: string)
⋮----
const showThemeConflictNotification = () =>
⋮----
// Could send a default font here if needed
⋮----
export function watchKenvDirectory()
⋮----
function clearAllWatchers(watchers: FSWatcher[])
⋮----
function stopPingInterval()
⋮----
function startPingInterval()
⋮----
function startCoreWatchers(): FSWatcher[]
⋮----
function logActionReason(context: 'Setup' | 'Teardown', reason: string)
⋮----
const countWatchedFiles = (w: FSWatcher)
⋮----
function canRestartWatcher(key: string):
⋮----
function isSystemOverloaded(): boolean
⋮----
function recordSystemFailure()
⋮----
function safeRestartWatcher(manager: any, key: string, reason: string): boolean
⋮----
function cleanupRestartAttempts()
⋮----
function checkSystemHealth()
⋮----
async function checkValidChange(eventName: WatchEvent, filePath: string): Promise<boolean>
⋮----
export async function handleFileChangeEvent(eventName: WatchEvent, filePath: string, source: string)
```

## File: src/renderer/src/effects/avatarCache.ts
```typescript
import { withAtomEffect } from 'jotai-effect';
import { userAtom } from '../jotai';
import { cacheImage } from '../utils/image-cache';
```

## File: src/renderer/src/utils/image-cache.ts
```typescript
import { AppChannel } from '../../../shared/enums';
⋮----
export async function cacheImage(url: string): Promise<string>
⋮----
// Check local memory cache first
⋮----
// Request from main process cache (persists across windows)
⋮----
// Store in local memory cache for this window
⋮----
// If main process returns original URL, use it
⋮----
// Return original URL as fallback
⋮----
/**
 * Clears the avatar cache
 */
export async function clearAvatarCache(): Promise<void>
⋮----
// Clear local memory cache
⋮----
// Clear main process cache
⋮----
/**
 * Hook to use cached avatar URL
 */
import { useEffect, useState } from 'react';
⋮----
export function useCachedAvatar(avatarUrl: string | undefined): string | undefined
```

## File: src/shared/enums.ts
```typescript
import { ProcessType } from '@johnlindquist/kit/core/enum';
⋮----
export enum AppChannel {
  BUILD_TS_SCRIPT = 'BUILD_TS_SCRIPT',
  CSS_CHANGED = 'CSS_CHANGED',
  DRAG_FILE_PATH = 'DRAG_FILE_PATH',
  EDIT_SCRIPT = 'EDIT_SCRIPT',
  FOCUS_PROMPT = 'FOCUS_PROMPT',
  GET_ASSET = 'GET_ASSET',
  INIT_RESIZE_HEIGHT = 'INIT_RESIZE_HEIGHT',
  OPEN_FILE = 'OPEN_FILE',
  OPEN_SCRIPT = 'OPEN_SCRIPT',
  OPEN_SCRIPT_DB = 'OPEN_SCRIPT_DB',
  OPEN_SCRIPT_LOG = 'OPEN_SCRIPT_LOG',
  PROMPT_HEIGHT_RESET = 'PROMPT_HEIGHT_RESET',
  READ_FILE_CONTENTS = 'READ_FILE_CONTENTS',
  RECEIVE_FILE_CONTENTS = 'RECEIVE_FILE_CONTENTS',
  RESIZE = 'RESIZE',
  RUN_MAIN_SCRIPT = 'RUN_MAIN_SCRIPT',
  SET_FILEPATH_BOUNDS = 'SET_PROMPT_DB',
  SET_MAIN_HEIGHT = 'SET_MAIN_HEIGHT',
  END_PROCESS = 'END_PROCESS',
  FEEDBACK = 'SUBMIT_SURVEY',
  PROCESSES = 'PROCESSES',
  RUN_PROCESSES_SCRIPT = 'RUN_PROCESSES_SCRIPT',
  LOG = 'LOG',
  MAIN_SCRIPT = 'MAIN_SCRIPT',
  KIT_STATE = 'STATE',
  APPLY_UPDATE = 'APPLY_UPDATE',
  LOGIN = 'LOGIN',
  USER_CHANGED = 'USER_CHANGED',
  DEBUG_INFO = 'DEBUG_INFO',
  TERM_RESIZE = 'TERM_RESIZE',
  TERM_READY = 'TERM_READY',
  TERM_INPUT = 'TERM_INPUT',
  TERM_OUTPUT = 'TERM_OUTPUT',
  TERM_EXIT = 'TERM_EXIT',
  TERM_SELECTION = 'TERM_SELECTION',
  TERM_CAPTURE_READY = 'TERM_CAPTURE_READY',
  CSS_VARIABLE = 'CSS_VARIABLE',
  TERM_ATTACHED = 'TERM_ATTACHED',
  SET_TERM_CONFIG = 'SET_TERM_CONFIG',
  SET_MIC_CONFIG = 'SET_MIC_CONFIG',
  ZOOM = 'ZOOM',
  TERM_KILL = 'TERM_KILL',
  AUDIO_DATA = 'AUDIO_DATA',
  TAKE_SELFIE = 'TAKE_SELFIE',
  SET_WEBCAM_ID = 'SET_WEBCAM_ID',
  SET_MIC_ID = 'SET_MIC_ID',
  RELOAD = 'RELOAD',
  GET_CACHED_AVATAR = 'GET_CACHED_AVATAR',
  CLEAR_AVATAR_CACHE = 'CLEAR_AVATAR_CACHE',
  ERROR_RELOAD = 'ERROR_RELOAD',
  ENABLE_BACKGROUND_THROTTLING = 'ENABLE_BACKGROUND_THROTTLING',
  SET_BOUNDS = 'SET_BOUNDS',
  HIDE = 'HIDE',
  SHOW = 'SHOW',
  PRE_SHOW = 'PRE_SHOW',
  PTY_READY = 'PTY_READY',
  PROMPT_UNLOAD = 'PROMPT_UNLOAD',
  SCROLL_TO_TOP = 'SCROLL_TO_TOP',
  SCROLL_TO_INDEX = 'SCROLL_TO_INDEX',
  INVOKE_SEARCH = 'INVOKE_SEARCH',
  INVOKE_FLAG_SEARCH = 'INVOKE_FLAG_SEARCH',
  SET_PRELOADED = 'SET_PRELOADED',
  TRIGGER_KEYWORD = 'TRIGGER_KEYWORD',
  RESET_PROMPT = 'RESET_PROMPT',
  SET_CACHED_MAIN_SCORED_CHOICES = 'SET_CACHED_MAIN_SCORED_CHOICES',
  SET_CACHED_MAIN_SHORTCUTS = 'SET_CACHED_MAIN_SHORTCUTS',
  SET_CACHED_MAIN_PREVIEW = 'SET_CACHED_MAIN_PREVIEW',
  SET_CACHED_MAIN_STATE = 'SET_CACHED_MAIN_STATE',
  SET_TERM_FONT = 'SET_TERM_FONT',
  BEFORE_INPUT_EVENT = 'BEFORE_INPUT_EVENT',
  INIT_PROMPT = 'INIT_PROMPT',
  MESSAGES_READY = 'MESSAGES_READY',
  SET_CACHED_MAIN_SCRIPT_FLAGS = 'SET_CACHED_MAIN_SCRIPT_FLAGS',
  CLEAR_CACHE = 'CLEAR_CACHE',
  CLOSE_PROMPT = 'CLOSE_PROMPT',
  GET_KIT_CONFIG = 'GET_KIT_CONFIG',
  FORCE_RENDER = 'FORCE_RENDER',
  INPUT_READY = 'INPUT_READY',
  MAKE_WINDOW = 'MAKE_WINDOW',
  SET_KEYBOARD_LAYOUT = 'SET_KEYBOARD_LAYOUT',
  RUN_KENV_TRUST_SCRIPT = 'RUN_KENV_TRUST_SCRIPT',
  TRIGGER_RESIZE = 'TRIGGER_RESIZE',
  SET_PROMPT_BLURRED = 'SET_PROMPT_BLURRED',
}
⋮----
export enum WindowChannel {
  SET_LAST_LOG_LINE = 'LOG_LINE',
  SET_EDITOR_LOG_MODE = 'SET_EDITOR_LOG_MODE',
  SET_LOG_VALUE = 'SET_LOG_VALUE',
  CLEAR_LOG = 'CLEAR_LOG',
  MOUNTED = 'MOUNTED',
}
⋮----
export enum Trigger {
  App = ProcessType.App,
  Background = ProcessType.Background,
  Info = 'info',
  Schedule = ProcessType.Schedule,
  Snippet = 'snippet',
  System = ProcessType.System,
  Shortcut = 'shortcut',
  Watch = ProcessType.Watch,
  Kit = 'kit',
  Kar = 'kar',
  Menu = 'menu',
  Tray = 'tray',
  RunTxt = 'runTxt',
  Protocol = 'Protocol',
  MissingPackage = 'MissingPackage',
  Error = 'Error',
}
⋮----
export enum HideReason {
  MainShortcut = 'MainShortcut',
  User = 'User',
  Blur = 'Blur',
  PingTimeout = 'PingTimeout',
  LockScreen = 'LockScreen',
  DebuggerClosed = 'DebuggerClosed',
  MessageFailed = 'MessageFailed',
  Escape = 'Escape',
  Suspend = 'Suspend',
  DevToolsClosed = 'DevToolsClosed',
  DomReady = 'DomReady',
  RunPromptProcess = 'RunPromptProcess',
  Destroy = 'Destroy',
  NoScript = 'NoScript',
  BeforeExit = 'BeforeExit',
}
⋮----
export enum Widget {
  DefaultTitle = 'Script Kit Widget',
}
```

## File: src/main/prompt.set-prompt-data.ts
```typescript
import { Channel, UI } from '@johnlindquist/kit/core/enum';
import type { PromptData } from '@johnlindquist/kit/types/core';
import { debounce } from 'lodash-es';
import { getMainScriptPath } from '@johnlindquist/kit/core/utils';
import { AppChannel } from '../shared/enums';
import { kitState, preloadPromptDataMap } from './state';
import { setFlags } from './search';
import { createPty } from './pty';
import { applyPromptDataBounds } from './prompt.bounds-utils';
⋮----
export const setPromptDataImpl = async (prompt: any, promptData: PromptData): Promise<void> =>
```

## File: src/renderer/src/components/input.tsx
```typescript
import { Channel, PROMPT } from '@johnlindquist/kit/core/enum';
import log from 'electron-log';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import {
  type ChangeEvent,
  type KeyboardEvent,
  type LegacyRef,
  type RefObject,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { useCachedAvatar } from '../utils/image-cache';
import { GithubIcon } from './icons';
⋮----
import useResizeObserver from '@react-hook/resize-observer';
import { debounce } from 'lodash-es';
import { useFocus, useKeyIndex, useTab } from '../hooks/index.js';
import {
  _lastKeyDownWasModifierAtom,
  _modifiers,
  actionsAtom,
  cachedAtom,
  channelAtom,
  choiceInputsAtom,
  enterButtonDisabledAtom,
  enterButtonNameAtom,
  flaggedChoiceValueAtom,
  flagsAtom,
  focusedChoiceAtom,
  footerHiddenAtom,
  gridReadyAtom,
  inputAtom,
  inputFocusAtom,
  inputFontSizeAtom,
  inputHeightAtom,
  invalidateChoiceInputsAtom,
  kitStateAtom,
  lastKeyDownWasModifierAtom,
  _miniShortcutsHoveredAtom,
  miniShortcutsVisibleAtom,
  modifiers,
  onInputSubmitAtom,
  placeholderAtom,
  promptDataAtom,
  selectionStartAtom,
  sendActionAtom,
  sendShortcutAtom,
  shortcodesAtom,
  shortcutsAtom,
  shouldActionButtonShowOnInputAtom,
  signInActionAtom,
  submitValueAtom,
  submittedAtom,
  userAtom,
} from '../jotai';
import { ActionButton } from './actionbutton';
import { EnterButton } from './actionenterbutton';
import { OptionsButton } from './actionoptionsbutton';
import { ActionSeparator } from './actionseparator';
import { IconButton } from './icon';
⋮----
const remapModifiers = (m: string) =>
⋮----
function ResizableInput(
⋮----
// focus
⋮----
inputWidthRef.current = newWidth; //Math.max(newWidth, minWidth);
⋮----
// focus the input
⋮----
function QuickInputs()
⋮----
const minWidth = 96; // Set a minimum width for the input
⋮----
const newWidth = Math.ceil((hiddenInputRef?.current?.offsetWidth || 0) + 1); // Adding 1px for better accuracy
⋮----
// log.info(event.target.value, { cached: cached ? 'true' : 'false' });
⋮----
// log.info(`${window.pid}: onKeyDown: ${event}`, event);
// if command is pressed
⋮----
xmlns="http://www.w3.org/2000/svg"
```

## File: src/renderer/src/state/atoms/app-core.ts
```typescript
import type { UserDb } from '@johnlindquist/kit/core/db';
import type { ProcessInfo } from '@johnlindquist/kit/types/core';
import { atom } from 'jotai';
⋮----
export const getPid = ()
```

## File: src/main/prompt.init-utils.ts
```typescript
import type { KitPrompt } from './prompt';
import { Channel } from '@johnlindquist/kit/core/enum';
import { HideReason } from '../shared/enums';
import { getMainScriptPath } from '@johnlindquist/kit/core/utils';
import { kitState } from './state';
import { AppChannel } from '../shared/enums';
import { getAssetPath } from '../shared/assets';
import os from 'node:os';
import path from 'node:path';
import { getVersion } from './version';
import { ipcMain, shell } from 'electron';
import { KitEvent, emitter } from '../shared/events';
import { processes } from './process';
import { cliFromParams, runPromptProcess } from './kit';
import { kitPath } from '@johnlindquist/kit/core/utils';
import { app, BrowserWindow } from 'electron';
import { fileURLToPath } from 'node:url';
⋮----
export function setupDevtoolsHandlers(prompt: KitPrompt)
⋮----
export function setupDomAndFinishLoadHandlers(prompt: KitPrompt)
⋮----
const messagesReadyHandler = async (_event, _pid) =>
⋮----
export function setupNavigationHandlers(prompt: KitPrompt)
⋮----
export function loadPromptHtml(prompt: KitPrompt)
⋮----
export function setupWindowLifecycleHandlers(prompt: KitPrompt)
```

## File: src/renderer/src/App.tsx
```typescript
import { debounce } from "lodash-es";
import React, {
	type ErrorInfo,
	type RefObject,
	useCallback,
	useEffect,
	useRef,
} from "react";
import { ToastContainer, cssTransition } from "react-toastify";
⋮----
import useResizeObserver from "@react-hook/resize-observer";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import {
	type ImperativePanelHandle,
	Panel as PanelChild,
	PanelGroup,
	PanelResizeHandle,
} from "react-resizable-panels";
import AutoSizer from "react-virtualized-auto-sizer";
⋮----
import { Channel, UI } from "@johnlindquist/kit/core/enum";
import ActionBar from "./components/actionbar";
import Console from "./components/console";
import Drop from "./components/drop";
import Editor from "./components/editor";
import Form from "./components/form";
import Header from "./components/header";
import Hint from "./components/hint";
import Hotkey from "./components/hotkey";
import Input from "./components/input";
import List from "./components/list";
import Log from "./components/log";
import Panel from "./components/panel";
import Tabs from "./components/tabs";
import TextArea from "./components/textarea";
import {
	appBoundsAtom,
	audioDotAtom,
	channelAtom,
	cssAtom,
	domUpdatedAtom,
	flaggedChoiceValueAtom,
	focusedElementAtom,
	footerHiddenAtom,
	headerHiddenAtom,
	hintAtom,
	inputAtom,
	inputWhileSubmittedAtom,
	isMainScriptAtom,
	isMouseDownAtom,
	isWindowAtom,
	kitStateAtom,
	loadingAtom,
	logHTMLAtom,
	mainHeightAtom,
	micIdAtom,
	micMediaRecorderAtom,
	mouseEnabledAtom,
	onDropAtom,
	onPasteAtom,
	openAtom,
	panelHTMLAtom,
	pidAtom,
	previewCheckAtom,
	processesAtom,
	progressAtom,
	promptDataAtom,
	scoredChoicesAtom,
	scriptAtom,
	showTabsAtom,
	submitValueAtom,
	submittedAtom,
	tempThemeAtom,
	termConfigAtom,
	themeAtom,
	topRefAtom,
	triggerResizeAtom,
	uiAtom,
	userAtom,
	zoomAtom,
} from './jotai';
⋮----
import { loader } from "@monaco-editor/react";
⋮----
import { AppChannel } from "../../shared/enums";
import AudioDot from "./audio-dot";
import AudioRecorder from "./audio-recorder";
import ActionsList from "./components/actions-list";
import { Chat } from "./components/chat";
import Emoji from "./components/emoji";
import Inspector from "./components/inspector";
import Preview from "./components/preview";
import Splash from "./components/splash";
import { useEnter, useEscape, useMessages, useShortcuts } from "./hooks";
import LoadingDot from "./loading-dot";
import ProcessesDot from "./processes-dot";
import ProgressBar from "./progress-bar";
import Terminal from "./term";
import Webcam from "./webcam";
import { ResizeController } from "./state/controllers/ResizeController";
import { IPCController } from "./state/controllers/IPCController";
import { FocusController } from "./state/controllers/FocusController";
import { ChoicesController } from "./state/controllers/ChoicesController";
import { UIController } from "./state/controllers/UIController";
⋮----
import editorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker";
import jsonWorker from "monaco-editor/esm/vs/language/json/json.worker?worker";
import cssWorker from "monaco-editor/esm/vs/language/css/css.worker?worker";
import htmlWorker from "monaco-editor/esm/vs/language/html/html.worker?worker";
import tsWorker from "monaco-editor/esm/vs/language/typescript/ts.worker?worker";
import { themeAppearanceEffect } from "./effects/theme";
import { unobserveResize } from "./effects/resize";
import { chatMessagesWithEffect } from "./effects/chat";
import { logFormatterEffect } from "./effects/logFormatter";
import { typingEffect } from "./effects/typing";
import { audioPlaybackEffect } from "./effects/audioPlayback";
import { focusPromptEffect } from "./effects/focusPrompt";
import { micStreamEffect } from "./effects/micStream";
import { speechEffect } from "./effects/speech";
import { webcamEffect } from "./effects/webcam";
import { termExitEffect } from "./effects/termExit";
import { windowModeEffect } from "./effects/windowMode";
import { previewEnabledEffect } from "./effects/previewEnabled";
import { selectionBroadcastEffect } from "./effects/selectionBroadcast";
import { escapeAudioEffect } from "./effects/escapeAudio";
⋮----
getWorker(_, label)
⋮----
import { createLogger } from "./log-utils";
⋮----
class ErrorBoundary extends React.Component
⋮----
componentDidCatch(error: Error, info: ErrorInfo)
⋮----
// Display fallback UI
⋮----
// You can also log the error to an error reporting service
⋮----
render()
⋮----
const handleFocusIn = (event: FocusEvent) =>
⋮----
const handleVisibilityChange = () =>
⋮----
const errorHandler = async (event: ErrorEvent) =>
⋮----
const mutationCallback = (mutationsList: MutationRecord[]) =>
⋮----
const handler = async () =>
⋮----
const processesHandler = (_, data) =>
⋮----
const userChangedHandler = (_, data) =>
```
