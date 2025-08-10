# Circular Dependencies Refactor - Runtime Error Investigation

## Issue
After refactoring to remove circular dependencies from the Script Kit renderer state management, we're encountering a runtime error:

```
TypeError: Cannot destructure property 'id' of 'focused' as it is undefined
```

The error appears when the SDK tries to access the `focused` property from the app state, but it's undefined.

## Background
The refactor aimed to:
1. Move side-effects out of atoms into controllers
2. Decouple IPC communication from state atoms  
3. Untangle circular dependencies between choices/index/focus management
4. Create proper module boundaries with controllers, services, and selectors

## Key Changes Made

### New Files Created
- `src/renderer/src/state/controllers/ResizeController.tsx` - Handles all resize side-effects
- `src/renderer/src/state/controllers/IPCController.tsx` - Manages IPC message publishing
- `src/renderer/src/state/controllers/FocusController.tsx` - Manages focus state updates
- `src/renderer/src/state/selectors/appState.ts` - Lightweight app state selector
- `src/renderer/src/state/selectors/resizeInputs.ts` - Aggregates resize calculation inputs
- `src/renderer/src/state/services/ipc.ts` - Pure IPC helper functions
- `src/renderer/src/state/services/resize.ts` - Pure resize calculation functions

### Files Modified Summary
```
 src/renderer/src/App.tsx               |   6 +
 src/renderer/src/effects/resize.ts     |   9 +-
 src/renderer/src/jotai.ts              | 225 ++++-----------------------------
 src/renderer/src/state/atoms/bounds.ts |   3 +-
 src/renderer/src/state/prompt-data.ts  |   3 +-
 src/renderer/src/state/script-state.ts |   7 +-
 6 files changed, 45 insertions(+), 208 deletions(-)
```

## Complete Diff

### Modified Files
```diff
diff --git a/src/renderer/src/App.tsx b/src/renderer/src/App.tsx
index 4b1b94f5..51edb42f 100644
--- a/src/renderer/src/App.tsx
+++ b/src/renderer/src/App.tsx
@@ -97,6 +97,9 @@ import ProcessesDot from "./processes-dot";
 import ProgressBar from "./progress-bar";
 import Terminal from "./term";
 import Webcam from "./webcam";
+import { ResizeController } from "./state/controllers/ResizeController";
+import { IPCController } from "./state/controllers/IPCController";
+import { FocusController } from "./state/controllers/FocusController";
 
 import editorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker";
 import jsonWorker from "monaco-editor/esm/vs/language/json/json.worker?worker";
@@ -591,6 +594,9 @@ export default function App() {
 
 	return (
 		<ErrorBoundary>
+			<ResizeController />
+			<IPCController />
+			<FocusController />
 			{
 				<div
 					id="main-container"
diff --git a/src/renderer/src/effects/resize.ts b/src/renderer/src/effects/resize.ts
index b1b1e4ad..b67aed81 100644
--- a/src/renderer/src/effects/resize.ts
+++ b/src/renderer/src/effects/resize.ts
@@ -8,10 +8,10 @@ import {
     uiAtom,
     boundsAtom,
     promptResizedByHumanAtom,
-    resize,
+    _mainHeight,
 } from "../state";
 
-// Observe geometry-related atoms and trigger a single debounced resize per batch.
+// Observe geometry-related atoms and trigger a state update for ResizeController.
 export const unobserveResize = observe((get, set) => {
     // Access dependencies so jotai-effect tracks them.
     get(mainHeightAtom);
@@ -23,6 +23,7 @@ export const unobserveResize = observe((get, set) => {
     get(boundsAtom);
     get(promptResizedByHumanAtom);
 
-    // Call existing resize helper once per transaction.
-    resize(get as any, set as any, 'EFFECT');
+    // Trigger state update for ResizeController to detect
+    const current = get(_mainHeight);
+    set(_mainHeight, current);
 });
diff --git a/src/renderer/src/jotai.ts b/src/renderer/src/jotai.ts
index c469edc8..37dfa3e1 100644
--- a/src/renderer/src/jotai.ts
+++ b/src/renderer/src/jotai.ts
@@ -208,20 +208,17 @@ import { createLogger } from './log-utils';
 import { arraysEqual, colorUtils, dataUtils, domUtils } from './utils/state-utils';
 import { removeTopBorderOnFirstItem, calcVirtualListHeight } from './state/utils';
 import { advanceIndexSkipping } from './state/skip-nav';
-import { computeResize } from './state/resize/compute';
+// computeResize removed - now handled by ResizeController
 import {
   SCROLL_THROTTLE_MS,
   PREVIEW_THROTTLE_MS,
   RESIZE_DEBOUNCE_MS,
-  SEND_RESIZE_DEBOUNCE_MS,
   JUST_OPENED_MS,
   PROCESSING_SPINNER_DELAY_MS,
   MAX_VLIST_HEIGHT,
   MAX_TABCHECK_ATTEMPTS,
 } from './state/constants';
 import {
-  ID_HEADER,
-  ID_FOOTER,
   ID_MAIN,
   ID_LIST,
   ID_PANEL,
@@ -243,7 +240,7 @@ let wereChoicesPreloaded = false;
 let wasPromptDataPreloaded = false;
 let prevFocusedChoiceId = 'prevFocusedChoiceId';
 let prevChoiceIndexId = 'prevChoiceIndexId';
-let prevTopHeight = 0;
+// prevTopHeight removed - now handled by ResizeController
 
 // --- Open/Close Lifecycle with Reset ---
 export const openAtom = atom(
@@ -560,7 +557,9 @@ export const inputAtom = atom(
     }
 
     if (g(_inputChangedAtom) && a === '') {
-      resize(g, s, 'INPUT_CLEARED');
+      // Trigger state update for ResizeController to detect input cleared
+      const currentHeight = g(_mainHeight);
+      s(_mainHeight, currentHeight);
     }
   },
 );
@@ -701,9 +700,8 @@ export const scoredChoicesAtom = atom(
     s(hasSkipAtom, hasSkip);
     s(allSkipAtom, allSkip);
 
-    if (changed) {
-      s(indexAtom, 0);
-    }
+    // Index reset is now handled by FocusController
+    // Don't reset index here to avoid circular dependency
 
     const isFilter = g(uiAtom) === UI.arg && g(promptData)?.mode === Mode.FILTER;
     const channel = g(channelAtom);
@@ -889,7 +887,9 @@ export const flaggedChoiceValueAtom = atom(
 
     const channel = g(channelAtom);
     channel(Channel.ON_MENU_TOGGLE);
-    resize(g, s, 'FLAG_VALUE');
+    // Trigger state update for ResizeController to detect flag value change
+    const currentHeight = g(_mainHeight);
+    s(_mainHeight, currentHeight);
   },
 );
 
@@ -970,188 +970,25 @@ export const flagsIndexAtom = atom(
 );
 
 // --- Resize Logic ---
-const sendResize = (data: ResizeData) => ipcRenderer.send(AppChannel.RESIZE, data);
-const debounceSendResize = debounce(sendResize, SEND_RESIZE_DEBOUNCE_MS);
-
-export const resize = debounce(
-  (g: Getter, s: Setter, reason = 'UNSET') => {
-    const human = g(promptResizedByHumanAtom);
-    if (human) {
-      g(channelAtom)(Channel.SET_BOUNDS, g(promptBoundsAtom));
-      return;
-    }
-
-    const active = g(promptActiveAtom);
-    if (!active) return;
-
-    const promptData = g(promptDataAtom);
-    if (!promptData?.scriptPath) return;
-
-    const ui = g(uiAtom);
-    const scoredChoicesLength = g(scoredChoicesAtom)?.length;
-    const hasPanel = g(_panelHTML) !== '';
-    let mh = g(mainHeightAtom);
-
-    if (promptData?.grid && document.getElementById(ID_MAIN)?.clientHeight > 10) {
-      return;
-    }
-
-    const placeholderOnly = promptData?.mode === Mode.FILTER && scoredChoicesLength === 0 && ui === UI.arg;
-    const topHeight = document.getElementById(ID_HEADER)?.offsetHeight || 0;
-    const footerHeight = document.getElementById(ID_FOOTER)?.offsetHeight || 0;
-    const hasPreview = g(previewCheckAtom);
-    const choicesHeight = g(choicesHeightAtom);
-
-    // Calculate Main Height (mh) based on UI state
-    if (ui === UI.arg) {
-      if (!g(choicesReadyAtom)) return;
-
-      if (choicesHeight > PROMPT.HEIGHT.BASE) {
-        log.info(`🍃 choicesHeight: ${choicesHeight} > PROMPT.HEIGHT.BASE: ${PROMPT.HEIGHT.BASE}`);
-        const baseHeight = (promptData?.height && promptData.height > PROMPT.HEIGHT.BASE) ? promptData.height : PROMPT.HEIGHT.BASE;
-        mh = baseHeight - topHeight - footerHeight;
-      } else {
-        log.info(`🍃 choicesHeight: ${choicesHeight} <= PROMPT.HEIGHT.BASE: ${PROMPT.HEIGHT.BASE}`);
-        mh = choicesHeight;
-      }
-    }
-
-    if (mh === 0 && hasPanel) {
-      mh = Math.max(g(itemHeightAtom), g(mainHeightAtom));
-    }
-
-    let forceResize = false;
-    let ch = 0;
-
-    try {
-      if (ui === UI.form || ui === UI.fields) {
-        ch = (document as any)?.getElementById(UI.form)?.offsetHeight;
-        mh = ch;
-      } else if (ui === UI.div) {
-        ch = (document as any)?.getElementById(ID_PANEL)?.offsetHeight;
-        if (ch) {
-          mh = promptData?.height || ch;
-        } else {
-          return;
-        }
-      } else if (ui === UI.arg && hasPanel) {
-        ch = (document as any)?.getElementById(ID_PANEL)?.offsetHeight;
-        mh = ch;
-        forceResize = true;
-      } else if (ui === UI.arg && !hasPanel && !scoredChoicesLength && !document.getElementById(ID_LIST)) {
-        ch = 0;
-        mh = 0;
-        forceResize = true;
-      } else if (ui !== UI.arg) {
-        ch = (document as any)?.getElementById(ID_MAIN)?.offsetHeight;
-      }
-
-      if (ui === UI.arg) {
-        forceResize = ch === 0 || Boolean(ch < choicesHeight) || hasPanel;
-      } else if (ui === UI.div) {
-        forceResize = true;
-      } else {
-        forceResize = Boolean(ch > g(prevMh));
-      }
-    } catch (error) {
-      // Handle potential DOM errors gracefully
-    }
-
-    if (topHeight !== prevTopHeight) {
-      forceResize = true;
-      prevTopHeight = topHeight;
-    }
-
-    const logVisible = g(logHTMLAtom)?.length > 0 && g(scriptAtom)?.log !== false;
-    const logHeight = document.getElementById(ID_LOG)?.offsetHeight || 0;
-
-    const computeOut = computeResize({
-      ui,
-      scoredChoicesLength: scoredChoicesLength || 0,
-      choicesHeight,
-      hasPanel,
-      hasPreview,
-      promptData: { height: promptData?.height, baseHeight: PROMPT.HEIGHT.BASE },
-      topHeight,
-      footerHeight,
-      isWindow: g(isWindowAtom),
-      justOpened: Boolean(g(justOpenedAtom)),
-      flaggedValue: g(_flaggedValue),
-      mainHeightCurrent: mh,
-      itemHeight: g(itemHeightAtom),
-      logVisible,
-      logHeight,
-      gridActive: g(gridReadyAtom),
-      prevMainHeight: g(prevMh),
-      placeholderOnly,
-    });
-
-    mh = computeOut.mainHeight;
-    let forceHeight = computeOut.forceHeight;
-
-    if (ui === UI.debugger) {
-      forceHeight = 128;
-    }
-
-    if (mh === 0 && promptData?.preventCollapse) {
-      log.info('🍃 Prevent collapse to zero...');
-      return;
-    }
-
-    log.info(`🍃 mh: ${mh}`, `forceHeight: ${forceHeight}`);
-
-    const data: ResizeData = {
-      id: promptData?.id || 'missing',
-      pid: window.pid || 0,
-      reason,
-      scriptPath: g(_script)?.filePath,
-      placeholderOnly,
-      topHeight,
-      ui,
-      mainHeight: mh + (g(isWindowAtom) ? 24 : 0) + 1,
-      footerHeight,
-      mode: promptData?.mode || Mode.FILTER,
-      hasPanel,
-      hasInput: g(inputAtom)?.length > 0,
-      previewEnabled: g(previewEnabledAtom),
-      open: g(_open),
-      tabIndex: g(_tabIndex),
-      isSplash: g(isSplashAtom),
-      hasPreview,
-      inputChanged: g(_inputChangedAtom),
-      forceResize,
-      forceHeight,
-      isWindow: g(isWindowAtom),
-      justOpened: g(justOpenedAtom) as any,
-      forceWidth: promptData?.width as any,
-      totalChoices: scoredChoicesLength as any,
-      isMainScript: g(isMainScriptAtom) as any,
-    } as ResizeData;
-
-    s(prevMh, mh);
-
-    debounceSendResize.cancel();
-    if (g(justOpenedAtom) && !promptData?.scriptlet) {
-      debounceSendResize(data);
-    } else {
-      sendResize(data);
-    }
-  },
-  RESIZE_DEBOUNCE_MS,
-  { leading: true, trailing: true },
-);
-
+// The resize logic has been moved to ResizeController
+// This atom is kept for compatibility but now just triggers a state change
+// that the ResizeController will react to
 export const triggerResizeAtom = atom(null, (g, s, reason: string) => {
-  resize(g, s, `TRIGGER_RESIZE: ${reason}`);
+  // Force a state update that ResizeController will detect
+  // This is a temporary compatibility layer
+  const current = g(_mainHeight);
+  s(_mainHeight, current);
 });
 
 export const domUpdatedAtom = atom(null, (g, s) => {
   return debounce((reason = '') => {
-    resize(g, s, reason);
+    // Trigger state update for ResizeController to detect
+    const current = g(_mainHeight);
+    s(_mainHeight, current);
   }, PREVIEW_THROTTLE_MS);
 });
 
-// Override mainHeightAtom with complex setter that triggers resize
+// Simple mainHeightAtom without side-effects - resize is handled by ResizeController
 export const mainHeightAtom = atom(
   (g) => g(_mainHeight),
   (g, s, a: number) => {
@@ -1166,13 +1003,6 @@ export const mainHeightAtom = atom(
     }
 
     s(_mainHeight, nextMainHeight);
-    if (a === prevHeight) return;
-
-    // Skip resize trigger for specific UIs that manage their own dimensions
-    const ui = g(uiAtom);
-    if ([UI.drop, UI.editor, UI.textarea].includes(ui)) return;
-
-    resize(g, s, 'MAIN_HEIGHT');
   },
 );
 
@@ -1183,7 +1013,7 @@ export const channelAtom = atom((g) => {
   }
 
   return (channel: Channel, override?: any) => {
-    const state = g(appStateAtom);
+    const state = g(appStateAtom); // Read the full state
     const pid = g(pidAtom);
     const promptId = g(promptDataAtom)?.id as string;
 
@@ -1210,7 +1040,7 @@ export const appStateAtom = atom<AppState>((g: Getter) => {
     flag: g(focusedFlagValueAtom),
     index: g(indexAtom),
     flaggedValue: g(_flaggedValue) || '',
-    focused: g(_focused),
+    focused: g(_focused) || noChoice,  // Add noChoice fallback here too!
     tab: g(tabsAtom)?.[g(_tabIndex)] || '',
     modifiers: g(_modifiers),
     count: g(choicesAtom).length || 0,
@@ -1574,9 +1404,8 @@ export const triggerKeywordAtom = atom(
 
 // --- UI State ---
 
-export const isMainScriptInitialAtom = atom<boolean>((g) => {
-  return g(isMainScriptAtom) && g(inputAtom) === '';
-});
+// Re-export from selector to maintain compatibility
+export { isMainScriptInitialAtom } from './state/selectors/scriptSelectors';
 
 export const showTabsAtom = atom((g) => {
   const isArg = [UI.arg].includes(g(uiAtom));
@@ -1719,7 +1548,9 @@ export const topHeightAtom = atom(
   (g, s) => {
     const resizeComplete = g(resizeCompleteAtom);
     if (!resizeComplete) return;
-    resize(g, s, 'TOP_HEIGHT');
+    // Trigger state update for ResizeController to detect top height change
+    const currentHeight = g(_mainHeight);
+    s(_mainHeight, currentHeight);
   },
 );
 
diff --git a/src/renderer/src/state/atoms/bounds.ts b/src/renderer/src/state/atoms/bounds.ts
index bf809610..c6ec8d1b 100644
--- a/src/renderer/src/state/atoms/bounds.ts
+++ b/src/renderer/src/state/atoms/bounds.ts
@@ -4,7 +4,8 @@
  */
 
 import { atom } from 'jotai';
-import type { Rectangle } from 'electron';
+// Using Rectangle type from shared types to avoid electron import
+type Rectangle = { x: number; y: number; width: number; height: number; };
 import { PROMPT } from '@johnlindquist/kit/core/enum';
 import { createLogger } from '../../log-utils';
 import { itemHeightAtom, inputHeightAtom } from './ui-elements';
diff --git a/src/renderer/src/state/prompt-data.ts b/src/renderer/src/state/prompt-data.ts
index 6ccbbdcd..d9eefceb 100644
--- a/src/renderer/src/state/prompt-data.ts
+++ b/src/renderer/src/state/prompt-data.ts
@@ -20,6 +20,7 @@ import {
   cachedMainPromptDataAtom,
 } from './app-core';
 import { scriptAtom } from './script-state';
+import { isMainScriptAtom } from './shared-atoms';
 
 
 const { ipcRenderer } = window.electron;
@@ -35,7 +36,7 @@ export const promptData = atom<null | Partial<PromptData>>({
 });
 
 export const promptReadyAtom = atom(false);
-export const isMainScriptAtom = atom(false);
+// isMainScriptAtom moved to shared-atoms.ts to avoid circular dependency
 let wasPromptDataPreloaded = false;
 
 // The main atom setter that processes incoming PromptData and updates numerous other atoms.
diff --git a/src/renderer/src/state/script-state.ts b/src/renderer/src/state/script-state.ts
index b370fa70..83a6ec5d 100644
--- a/src/renderer/src/state/script-state.ts
+++ b/src/renderer/src/state/script-state.ts
@@ -7,8 +7,7 @@ import { atom } from 'jotai';
 import { noScript, SPLASH_PATH } from '../../../shared/defaults';
 import { createLogger } from '../log-utils';
 import { kitConfigAtom, pidAtom, processingAtom, loadingAtom, progressAtom } from './app-core';
-import { isMainScriptAtom } from './prompt-data';
-import { inputAtom } from './input-state';
+import { isMainScriptAtom } from './shared-atoms';
 
 const log = createLogger('script-state.ts');
 
@@ -61,9 +60,7 @@ export const isKitScriptAtom = atom<boolean>((g) => {
   return (g(_script) as Script)?.filePath?.includes(g(kitConfigAtom).kitPath);
 });
 
-export const isMainScriptInitialAtom = atom<boolean>((g) => {
-  return g(isMainScriptAtom) && g(inputAtom) === '';
-});
+// isMainScriptInitialAtom moved to selectors/scriptSelectors.ts to avoid circular dependency
 
 export const isSplashAtom = atom((g) => {
   return g(scriptAtom)?.filePath === SPLASH_PATH;
```

### New Files Added

#### `src/renderer/src/state/controllers/FocusController.tsx`
```typescript
import { useEffect, useRef } from 'react';
import { useAtomValue, useSetAtom } from 'jotai';
import { scoredChoicesAtom } from '../../jotai';
import { _indexAtom } from '../atoms/choices';
import { arraysEqual } from '../../utils/state-utils';

/**
 * Controller that manages focus/index changes when the choice list changes.
 * Separates the concern of resetting index from the choice scoring logic.
 */
export function FocusController() {
  const list = useAtomValue(scoredChoicesAtom);
  const setIndex = useSetAtom(_indexAtom);
  const prevIdsRef = useRef<string[]>([]);

  useEffect(() => {
    // Extract IDs from the current list
    const ids = list.map((c) => c.item.id) as string[];
    
    // Reset index to 0 when the list identity changes
    if (!arraysEqual(prevIdsRef.current, ids)) {
      // Only reset if the list actually changed
      if (prevIdsRef.current.length > 0 || ids.length > 0) {
        setIndex(0);
      }
    }
    
    prevIdsRef.current = ids;
  }, [list, setIndex]);

  return null;
}
```

#### `src/renderer/src/state/controllers/IPCController.tsx`
```typescript
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
    
    pushMessage({
      channel,
      state: override ? { ...state, ...override } : state,
    });
  };
}
```

#### `src/renderer/src/state/controllers/ResizeController.tsx`
```typescript
import { useEffect, useRef, useCallback } from 'react';
import { useAtomValue, useSetAtom } from 'jotai';
import { throttle, debounce } from 'lodash-es';
import { resizeInputsAtom } from '../selectors/resizeInputs';
import { _mainHeight, prevMh } from '../atoms/ui-elements';
import { performResize } from '../services/resize';
import { sendResize, sendChannel } from '../services/ipc';
import { _open } from '../atoms/lifecycle';
import { _tabIndex } from '../atoms/tabs';
import { _script } from '../atoms/script-state';
import { _inputAtom, _inputChangedAtom } from '../atoms/input';
import { isSplashAtom, isMainScriptAtom } from '../../jotai';
import { Channel, Mode, UI, PROMPT } from '@johnlindquist/kit/core/enum';
import type { ResizeData } from '../../../../shared/types';
import { ID_MAIN, ID_PANEL, ID_LIST } from '../dom-ids';
import { RESIZE_DEBOUNCE_MS, SEND_RESIZE_DEBOUNCE_MS } from '../constants';

const log = {
  info: (...args: any[]) => console.log('[Resize]', ...args),
};

/**
 * Controller that reacts to state changes and performs resize side-effects.
 * This is the ONLY place where resize IPC messages are sent.
 */
export function ResizeController() {
  const inputs = useAtomValue(resizeInputsAtom);
  const setMainHeight = useSetAtom(_mainHeight);
  const setPrevMh = useSetAtom(prevMh);
  const script = useAtomValue(_script);
  const open = useAtomValue(_open);
  const tabIndex = useAtomValue(_tabIndex);
  const inputValue = useAtomValue(_inputAtom);
  const inputChanged = useAtomValue(_inputChangedAtom);
  const isSplash = useAtomValue(isSplashAtom);
  const isMainScript = useAtomValue(isMainScriptAtom);
  
  const prevTopHeightRef = useRef(0);
  const debouncedSendRef = useRef(debounce(sendResize, SEND_RESIZE_DEBOUNCE_MS));

  const doResize = useCallback((reason = 'CONTROLLER') => {
    // Handle human resize case
    if (inputs.promptResizedByHuman) {
      sendChannel(Channel.SET_BOUNDS, inputs.promptBounds);
      return;
    }

    // Skip if not active or no script
    if (!inputs.promptActive || !inputs.promptData?.scriptPath) {
      return;
    }

    // Skip grid resize when main has content
    if (inputs.promptData?.grid && 
        typeof document !== 'undefined' && 
        document.getElementById(ID_MAIN)?.clientHeight > 10) {
      return;
    }

    // Get current mainHeight
    let mh = inputs.mainHeightCurrent;
    
    // Calculate based on UI type
    const { ui, choicesHeight, hasPanel, scoredChoicesLength } = inputs;
    
    if (ui === UI.arg) {
      // Skip if choices not ready
      const choicesReady = typeof document !== 'undefined' && 
        (document.getElementById(ID_LIST) || scoredChoicesLength === 0);
      if (!choicesReady) return;
      
      // Calculate height for arg UI
      if (choicesHeight > PROMPT.HEIGHT.BASE) {
        const baseHeight = (inputs.promptData?.height && inputs.promptData.height > PROMPT.HEIGHT.BASE) 
          ? inputs.promptData.height 
          : PROMPT.HEIGHT.BASE;
        mh = baseHeight - inputs.topHeight - inputs.footerHeight;
      } else {
        mh = choicesHeight;
      }
    }

    // Handle zero height with panel
    if (mh === 0 && hasPanel) {
      mh = Math.max(inputs.itemHeight, inputs.mainHeightCurrent);
    }

    // Check DOM-based UI heights
    let forceResize = false;
    let ch = 0;

    if (typeof document !== 'undefined') {
      try {
        if (ui === UI.form || ui === UI.fields) {
          ch = document.getElementById(UI.form)?.offsetHeight || 0;
          mh = ch;
        } else if (ui === UI.div) {
          ch = document.getElementById(ID_PANEL)?.offsetHeight || 0;
          if (ch) {
            mh = inputs.promptData?.height || ch;
          } else {
            return;
          }
        } else if (ui === UI.arg && hasPanel) {
          ch = document.getElementById(ID_PANEL)?.offsetHeight || 0;
          mh = ch;
          forceResize = true;
        } else if (ui === UI.arg && !hasPanel && !scoredChoicesLength && !document.getElementById(ID_LIST)) {
          ch = 0;
          mh = 0;
          forceResize = true;
        } else if (ui !== UI.arg) {
          ch = document.getElementById(ID_MAIN)?.offsetHeight || 0;
        }

        if (ui === UI.arg) {
          forceResize = ch === 0 || Boolean(ch < choicesHeight) || hasPanel;
        } else if (ui === UI.div) {
          forceResize = true;
        } else {
          forceResize = Boolean(ch > inputs.prevMainHeight);
        }
      } catch (error) {
        // Handle potential DOM errors gracefully
      }
    }

    // Check if top height changed
    if (inputs.topHeight !== prevTopHeightRef.current) {
      forceResize = true;
      prevTopHeightRef.current = inputs.topHeight;
    }

    // Perform resize calculation
    const result = performResize(inputs);
    mh = result.mainHeight;
    let forceHeight = result.forceHeight;

    // Special case for debugger UI
    if (ui === UI.debugger) {
      forceHeight = 128;
    }

    // Prevent collapse if configured
    if (mh === 0 && inputs.promptData?.preventCollapse) {
      log.info('Prevent collapse to zero...');
      return;
    }

    log.info(`mh: ${mh}`, `forceHeight: ${forceHeight}`);

    // Update main height atom
    setMainHeight(mh);
    setPrevMh(mh);

    // Prepare resize data
    const data: ResizeData = {
      id: inputs.promptData?.id || 'missing',
      pid: (window as any).pid || 0,
      reason,
      scriptPath: script?.filePath,
      placeholderOnly: inputs.placeholderOnly,
      topHeight: inputs.topHeight,
      ui,
      mainHeight: mh + (inputs.isWindow ? 24 : 0) + 1,
      footerHeight: inputs.footerHeight,
      mode: inputs.promptData?.mode || Mode.FILTER,
      hasPanel,
      hasInput: inputValue?.length > 0,
      previewEnabled: inputs.previewEnabled,
      open,
      tabIndex,
      isSplash,
      hasPreview: inputs.hasPreview,
      inputChanged,
      forceResize: forceResize || result.forceResize,
      forceHeight,
      isWindow: inputs.isWindow,
      justOpened: inputs.justOpened as any,
      forceWidth: inputs.promptData?.width as any,
      totalChoices: scoredChoicesLength as any,
      isMainScript: isMainScript as any,
    } as ResizeData;

    // Send resize message
    debouncedSendRef.current.cancel();
    if (inputs.justOpened && !inputs.promptData?.scriptlet) {
      debouncedSendRef.current(data);
    } else {
      sendResize(data);
    }
  }, [inputs, setMainHeight, setPrevMh, script, open, tabIndex, inputValue, inputChanged, isSplash, isMainScript]);

  // Throttle resize execution
  const throttledResize = useRef(
    throttle(doResize, RESIZE_DEBOUNCE_MS, { leading: true, trailing: true })
  );

  useEffect(() => {
    throttledResize.current();
    return () => {
      throttledResize.current.cancel();
      debouncedSendRef.current.cancel();
    };
  }, [doResize]);

  return null;
}
```

#### `src/renderer/src/state/selectors/appState.ts`
```typescript
import { atom } from 'jotai';
import { _inputAtom, _inputChangedAtom, _modifiers } from '../atoms/input';
import { _focused } from '../atoms/choices';
import { noChoice } from '../../../../shared/defaults';
import { _flaggedValue, _actionsInputAtom } from '../atoms/actions';
import { _tabIndex, tabsAtom } from '../atoms/tabs';
import { _submitValue } from '../atoms/ipc';
import { submittedAtom } from '../atoms/app-core';
import { _script } from '../atoms/script-state';
import { nameAtom, descriptionAtom } from '../atoms/ui-elements';
import { choicesAtom, selectedChoicesAtom } from '../atoms/choices';
import { editorCursorPosAtom } from '../atoms/editor';
import { modeAtom } from '../prompt-data';
// These complex atoms remain in jotai.ts for now
import { 
  focusedFlagValueAtom, 
  indexAtom, 
  uiAtom, 
  previewHTMLAtom,
  promptDataAtom,
  focusedActionAtom,
} from '../../jotai';
import type { AppState } from '@johnlindquist/kit/types/core';

/**
 * Lightweight app state selector for IPC communication.
 * Only includes the fields the main process actually needs.
 */
export const appStateLiteAtom = atom<AppState>((g) => {
  try {
    const focusedValue = g(_focused);
    if (!focusedValue) {
      console.warn('_focused atom returned undefined, using noChoice');
    }
    
    return {
      input: g(_inputAtom),
      actionsInput: g(_actionsInputAtom),
      inputChanged: g(_inputChangedAtom),
      flag: g(focusedFlagValueAtom),
      index: g(indexAtom),
      flaggedValue: g(_flaggedValue) || '',
      focused: focusedValue || noChoice,
      tab: g(tabsAtom)?.[g(_tabIndex)] || '',
      modifiers: g(_modifiers),
      count: g(choicesAtom)?.length || 0,
      name: g(nameAtom),
      description: g(descriptionAtom),
      script: g(_script),
      value: g(_submitValue),
      submitted: g(submittedAtom),
      cursor: g(editorCursorPosAtom),
      ui: g(uiAtom),
      tabIndex: g(_tabIndex),
      preview: g(previewHTMLAtom),
      keyword: '',
      mode: g(modeAtom),
      multiple: g(promptDataAtom)?.multiple,
      selected: g(selectedChoicesAtom)?.map((c) => c?.value) || [],
      action: g(focusedActionAtom),
    } as AppState;
  } catch (error) {
    console.error('Error in appStateLiteAtom:', error);
    // Return minimal state on error
    return {
      input: '',
      actionsInput: '',
      inputChanged: false,
      flag: '',
      index: 0,
      flaggedValue: '',
      focused: noChoice,
      tab: '',
      modifiers: '',
      count: 0,
      name: '',
      description: '',
      script: null,
      value: '',
      submitted: false,
      cursor: 0,
      ui: 'arg',
      tabIndex: 0,
      preview: '',
      keyword: '',
      mode: 'filter',
      multiple: false,
      selected: [],
      action: null,
    } as any;
  }
});
```

#### Other New Files
- `src/renderer/src/state/selectors/focusSelectors.ts` - Focus management selectors
- `src/renderer/src/state/selectors/ipcOutbound.ts` - IPC message queue
- `src/renderer/src/state/selectors/resizeInputs.ts` - Resize calculation inputs
- `src/renderer/src/state/selectors/scriptSelectors.ts` - Script-related selectors
- `src/renderer/src/state/services/ipc.ts` - Pure IPC helper functions
- `src/renderer/src/state/services/resize.ts` - Pure resize calculation functions

## The Problem

Despite adding `|| noChoice` fallback protection to the `focused` field in both `appStateAtom` and `appStateLiteAtom`, the SDK is still receiving an undefined value for `focused`.

### Current Protection in Place:

1. **appStateLiteAtom** (in `state/selectors/appState.ts`):
   - Checks if `_focused` returns undefined
   - Logs warning if undefined
   - Always returns `focusedValue || noChoice`

2. **appStateAtom** (in `jotai.ts`):
   - Has fallback: `focused: g(_focused) || noChoice`

3. **_focused atom initialization** (in `state/atoms/choices.ts`):
   - Initialized with: `atom<Choice | null>(noChoice as Choice)`

## Hypothesis

The issue appears to be timing-related. During the initial render or state initialization, the `focused` value might be undefined before the atoms are properly initialized.

### Possible Root Causes:

1. **Initialization Order**: The channelAtom might be reading state before all atoms are initialized
2. **State Propagation**: The IPCController might be sending state updates before the focused atom has a value
3. **Override Logic**: The `override` parameter in channelAtom might be setting focused to undefined
4. **Missing Import**: The noChoice default might not be imported correctly somewhere

## Debug Logging Added

Added debug logging to IPCController:
```typescript
if (!state.focused) {
  console.error('WARNING: state.focused is undefined!', state);
}
```

## Next Steps to Investigate

1. Check if the error occurs during initial mount or during state updates
2. Verify that noChoice is properly imported and defined
3. Trace where the destructuring of `focused.id` actually happens (likely in the SDK)
4. Check if any override values are setting focused to undefined
5. Verify the initialization order of atoms
6. Consider adding a guard in channelAtom to ensure state.focused is never undefined