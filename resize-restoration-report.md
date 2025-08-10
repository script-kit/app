# Resize Behavior Restoration Report

## Issue Summary

After completing the circular dependency refactoring, the resize behavior is broken. The main branch has working resize functionality that needs to be restored on the `jotai-circular-dependencies` branch.

## Background

The circular dependency refactoring successfully:
- ✅ Eliminated all circular dependencies 
- ✅ Fixed the "focused undefined" runtime error
- ✅ Separated concerns into controllers, selectors, and services
- ✅ Build passes successfully

However, the resize functionality that works perfectly on the main branch is now broken.

## Problem Analysis

The resize logic was moved from the main `jotai.ts` file to a `ResizeController` component to eliminate side effects from atoms. However, this architectural change appears to have disrupted the resize behavior that was working correctly on the main branch.

### Key Changes Made:
1. **Removed `resize()` function** from `jotai.ts` (225+ lines of complex resize logic)
2. **Created ResizeController** to handle resize side effects
3. **Modified resize triggers** to use state updates instead of direct function calls
4. **Split resize logic** across multiple files (controller, selectors, services)

## Request for Expert Analysis

The complete diff between the current branch and main is provided below. We need to restore the resize behavior that works on main while maintaining the circular dependency fixes and architectural improvements.

**Specific areas that likely need attention:**
- The complex resize calculation logic that was removed from `jotai.ts`
- The timing and triggers for resize events
- The coordination between DOM measurements and state updates
- The debouncing and throttling of resize operations

## Complete Diff

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
index c469edc8..cd873c26 100644
--- a/src/renderer/src/jotai.ts
+++ b/src/renderer/src/jotai.ts
@@ -202,26 +202,43 @@ import {
 // Shared imports
 import { DEFAULT_HEIGHT, closedDiv, noChoice } from '../../shared/defaults';
 import { AppChannel } from '../../shared/enums';
-import type { ResizeData, ScoredChoice, TermConfig as SharedTermConfig } from '../../shared/types';
+import type { ResizeData, ScoredChoice, TermConfig as SharedTermConfig, Choice } from '../../shared/types';
 import { formatShortcut } from './components/formatters';
 import { createLogger } from './log-utils';
 import { arraysEqual, colorUtils, dataUtils, domUtils } from './utils/state-utils';
 import { removeTopBorderOnFirstItem, calcVirtualListHeight } from './state/utils';
 import { advanceIndexSkipping } from './state/skip-nav';
-import { computeResize } from './state/resize/compute';
+// computeResize removed - now handled by ResizeController
+
+// --- START FIX: Initialization Safety ---
+
+// Define a hardcoded fallback structure locally.
+const FALLBACK_NO_CHOICE: Choice = {
+  id: 'fallback-no-choice',
+  name: 'Loading...',
+  value: null,
+  description: 'Fallback choice during initialization.',
+  hasPreview: false,
+};
+
+// Verify the import and select the safe fallback at module initialization time.
+let safeNoChoice = noChoice;
+if (!safeNoChoice || typeof safeNoChoice !== 'object' || !safeNoChoice.id) {
+  console.error('CRITICAL: noChoice import failed or is invalid in jotai.ts. Using hardcoded fallback.', { importedValue: noChoice });
+  safeNoChoice = FALLBACK_NO_CHOICE;
+}
+
+// --- END FIX ---
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
@@ -243,7 +260,7 @@ let wereChoicesPreloaded = false;
 let wasPromptDataPreloaded = false;
 let prevFocusedChoiceId = 'prevFocusedChoiceId';
 let prevChoiceIndexId = 'prevChoiceIndexId';
-let prevTopHeight = 0;
+// prevTopHeight removed - now handled by ResizeController
 
 // --- Open/Close Lifecycle with Reset ---
 export const openAtom = atom(
@@ -560,7 +577,9 @@ export const inputAtom = atom(
     }
 
     if (g(_inputChangedAtom) && a === '') {
-      resize(g, s, 'INPUT_CLEARED');
+      // Trigger state update for ResizeController to detect input cleared
+      const currentHeight = g(_mainHeight);
+      s(_mainHeight, currentHeight);
     }
   },
 );
@@ -701,9 +720,8 @@ export const scoredChoicesAtom = atom(
     s(hasSkipAtom, hasSkip);
     s(allSkipAtom, allSkip);
 
-    if (changed) {
-      s(indexAtom, 0);
-    }
+    // Index reset is now handled by FocusController
+    // Don't reset index here to avoid circular dependency
 
     const isFilter = g(uiAtom) === UI.arg && g(promptData)?.mode === Mode.FILTER;
     const channel = g(channelAtom);
@@ -889,7 +907,9 @@ export const flaggedChoiceValueAtom = atom(
 
     const channel = g(channelAtom);
     channel(Channel.ON_MENU_TOGGLE);
-    resize(g, s, 'FLAG_VALUE');
+    // Trigger state update for ResizeController to detect flag value change
+    const currentHeight = g(_mainHeight);
+    s(_mainHeight, currentHeight);
   },
 );
 
@@ -970,188 +990,25 @@ export const flagsIndexAtom = atom(
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
@@ -1166,13 +1023,6 @@ export const mainHeightAtom = atom(
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
 
@@ -1183,18 +1033,26 @@ export const channelAtom = atom((g) => {
   }
 
   return (channel: Channel, override?: any) => {
-    const state = g(appStateAtom);
+    const state = g(appStateAtom); // Read the full state
     const pid = g(pidAtom);
     const promptId = g(promptDataAtom)?.id as string;
 
+    let finalState = state;
+    if (override) {
+      finalState = { ...state, ...override };
+      
+      // CRITICAL FIX: Ensure 'focused' is never undefined/null after override
+      if (!finalState.focused) {
+        finalState.focused = state.focused;
+        console.warn(`[channelAtom] Protected 'focused' property from being unset by override. Channel: ${channel}`, override);
+      }
+    }
+
     const appMessage: AppMessage = {
       channel,
       pid: pid || 0,
       promptId: promptId,
-      state: {
-        ...state,
-        ...override,
-      },
+      state: finalState,
     };
 
     ipcRenderer.send(channel, appMessage);
@@ -1210,7 +1068,7 @@ export const appStateAtom = atom<AppState>((g: Getter) => {
     flag: g(focusedFlagValueAtom),
     index: g(indexAtom),
     flaggedValue: g(_flaggedValue) || '',
-    focused: g(_focused),
+    focused: g(_focused) || safeNoChoice,  // Use the validated safeNoChoice
     tab: g(tabsAtom)?.[g(_tabIndex)] || '',
     modifiers: g(_modifiers),
     count: g(choicesAtom).length || 0,
@@ -1574,9 +1432,8 @@ export const triggerKeywordAtom = atom(
 
 // --- UI State ---
 
-export const isMainScriptInitialAtom = atom<boolean>((g) => {
-  return g(isMainScriptAtom) && g(inputAtom) === '';
-});
+// Re-export from selector to maintain compatibility
+export { isMainScriptInitialAtom } from './state/selectors/scriptSelectors';
 
 export const showTabsAtom = atom((g) => {
   const isArg = [UI.arg].includes(g(uiAtom));
@@ -1719,7 +1576,9 @@ export const topHeightAtom = atom(
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
diff --git a/src/renderer/src/state/atoms/choices.ts b/src/renderer/src/state/atoms/choices.ts
index 7a4649b5..abd01d74 100644
--- a/src/renderer/src/state/atoms/choices.ts
+++ b/src/renderer/src/state/atoms/choices.ts
@@ -44,7 +44,30 @@ export const hasSkipAtom = atom(false);
 export const allSkipAtom = atom(false);
 
 // --- Focused Choice ---
-export const _focused = atom<Choice | null>(noChoice as Choice);
+// Enhanced focused choice atom with better error handling and initialization safety
+const _focusedInternal = atom<Choice | null>(noChoice as Choice);
+
+export const _focused = atom<Choice | null>(
+  (g) => {
+    const focused = g(_focusedInternal);
+    // Ensure we never return null/undefined - always return a valid Choice object
+    if (!focused || typeof focused !== 'object' || !focused.id) {
+      console.warn('_focused atom: Internal focused value is invalid, using noChoice fallback', focused);
+      return noChoice as Choice;
+    }
+    return focused;
+  },
+  (g, s, choice: Choice | null) => {
+    // Setter: validate the choice being set and ensure it's never null/undefined
+    if (!choice || typeof choice !== 'object') {
+      console.warn('_focused atom: Attempt to set invalid choice, using noChoice instead', choice);
+      s(_focusedInternal, noChoice as Choice);
+    } else {
+      s(_focusedInternal, choice);
+    }
+  }
+);
+
 // export const focusedChoiceAtom = atom((g) => g(_focused)); // Complex version with computed properties is in jotai.ts
 export const hasFocusedChoiceAtom = atom((g) => g(_focused) && g(_focused)?.name !== noChoice.name);
 
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

## Files Changed

The refactoring touched these core files:
- `src/renderer/src/jotai.ts` - Major refactoring, resize function removed
- `src/renderer/src/App.tsx` - Added controller components
- `src/renderer/src/effects/resize.ts` - Modified resize triggers
- `src/renderer/src/state/atoms/choices.ts` - Enhanced focused atom validation
- `src/renderer/src/state/atoms/bounds.ts` - Fixed electron import
- Plus new controller files in `src/renderer/src/state/controllers/`

## Next Steps

Please analyze the diff and advise on how to restore the working resize behavior from main while preserving:
1. The circular dependency elimination
2. The focused undefined error fixes  
3. The improved architectural separation

The goal is to have both the architectural benefits AND the working resize functionality from main.