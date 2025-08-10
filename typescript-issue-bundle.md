# TypeScript Import/Export Issue Investigation Report

## Issue Summary
After the circular dependency refactoring in the Script Kit Electron app, while the application is functionally working properly, there are many TypeScript import/export errors in the main jotai.ts file. The refactoring successfully eliminated circular dependencies and fixed runtime errors, but introduced TypeScript conflicts that need resolution.

## Investigation Findings

### Core Problem Analysis
The primary issues stem from **architectural transition conflicts** between the old monolithic jotai.ts file and the new modular atoms structure:

#### 1. **Duplicate Declarations**
- Many atoms are declared both in jotai.ts (complex versions) and in atoms modules (simple versions)
- Examples: `scoredChoicesAtom`, `flaggedChoiceValueAtom`, `indexAtom`, `focusedChoiceAtom`
- This creates TypeScript duplicate identifier errors

#### 2. **Missing Exports Pattern**
The atoms modules use a pattern where they export simple atoms but comment out complex versions:
```typescript
// In atoms/choices.ts
export const choices = atom<ScoredChoice[]>([]);
// export const scoredChoicesAtom = atom((g) => g(choices)); // Complex version in jotai.ts

// In atoms/actions.ts  
export const _flaggedValue = atom<Choice | string>('');
// export const flaggedChoiceValueAtom = atom((g) => g(_flaggedValue)); // Complex version in jotai.ts
```

But jotai.ts tries to import these non-existent exports, causing "cannot find name" errors.

#### 3. **Import Naming Conflicts**
- jotai.ts imports both simple atoms (like `_flaggedValue`) and expects complex atoms (like `flaggedChoiceValueAtom`)
- The export `* from './state/atoms'` at line 30 in jotai.ts conflicts with local declarations

#### 4. **Circular Dependency Resolution Side Effects**
- Some atoms that were moved to avoid circular dependencies now have incorrect import paths
- Choice type import issues where `Choice` is imported multiple times from different sources

### Specific TypeScript Errors Identified

#### Category 1: Missing Exports
These atoms are imported in jotai.ts but not exported from atoms modules:
- `scoredChoicesAtom` 
- `flaggedChoiceValueAtom`
- `indexAtom` (complex version)
- `focusedChoiceAtom` (complex version)
- `flagsIndexAtom` (complex version)

#### Category 2: Duplicate Identifiers
These are declared both locally in jotai.ts and imported from atoms:
- `Choice` type (imported from multiple sources)
- Various atom names that exist in both places

#### Category 3: Incorrect Import Names
jotai.ts imports atom names that don't match what's actually exported from the atoms modules.

## Relevant Files Included

### Key Problem Files
- **`src/renderer/src/jotai.ts`** - Main file with import/export conflicts, 1577 lines of complex wiring logic
- **`src/renderer/src/state/atoms/index.ts`** - Central export file that re-exports all modular atoms
- **`src/renderer/src/state/atoms/choices.ts`** - Choice management atoms with commented complex versions
- **`src/renderer/src/state/atoms/actions.ts`** - Actions/flags atoms with commented complex versions
- **`src/renderer/src/state/shared-atoms.ts`** - Minimal shared atoms to break circular dependencies

### Supporting Context
- **`circular-deps-refactor-issue.md`** - Background on the refactoring and runtime error investigation
- All other atoms modules showing the modular structure

## Root Cause Analysis

The fundamental issue is a **incomplete architectural migration**:

1. **Modular atoms were created** with simple versions of state atoms
2. **Complex wiring logic remained in jotai.ts** with full-featured versions of the same atoms  
3. **Import strategy was conflicted** - trying to import both simple and complex versions
4. **Export strategy was incomplete** - complex versions exist but aren't exported

## Recommended Fix Strategy

### Option 1: Complete the Modularization (Recommended)
**Pros:** Maintains architectural improvement goals, cleaner separation of concerns
**Cons:** More work, requires careful testing

Steps:
1. Move complex atom logic from jotai.ts to appropriate atoms modules
2. Export the complex versions from atoms modules 
3. Update jotai.ts to only import and re-export, no local declarations
4. Verify all wiring logic is preserved

### Option 2: Unified Export Strategy  
**Pros:** Minimal changes, lower risk
**Cons:** Maintains some architectural debt

Steps:
1. Export complex versions from atoms modules alongside simple versions
2. Remove duplicate declarations from jotai.ts
3. Clean up import statements
4. Keep complex wiring in jotai.ts but import dependencies properly

### Option 3: Rollback Import Strategy
**Pros:** Safest for functionality preservation  
**Cons:** Doesn't resolve architectural goals

Steps:
1. Remove `export * from './state/atoms'` from jotai.ts
2. Keep all complex logic in jotai.ts
3. Only import simple atoms as dependencies
4. Treat atoms modules as internal dependencies only

## Risk Assessment

### High Risk Areas
- **channelAtom and IPC communication** - Complex wiring that handles SDK communication
- **Resize logic integration** - Recently moved to ResizeController, sensitive to state changes
- **Focus/index management** - Critical for UI navigation, recently refactored  

### Low Risk Areas  
- **Simple state atoms** - Basic getters/setters that are well isolated
- **Theme and media atoms** - Self-contained functionality
- **Cache atoms** - Internal state management

## Safe Migration Approach

1. **Start with Option 2** - Export complex versions without moving logic
2. **Test thoroughly** - Ensure no functional regressions
3. **Gradually migrate** - Move complex logic piece by piece in separate PRs
4. **Maintain backup** - Keep jotai.ts.backup as reference

## Immediate Action Items for TypeScript Fix

### Priority 1: Critical Import/Export Mismatches
1. **Update atoms/choices.ts** - Export missing `scoredChoicesAtom` and `indexAtom` 
2. **Update atoms/actions.ts** - Export missing `flaggedChoiceValueAtom` and `flagsIndexAtom`
3. **Clean up jotai.ts imports** - Remove conflicting import names that don't exist

### Priority 2: Duplicate Declaration Resolution
1. **Choice type import** - Consolidate Choice imports to single source in jotai.ts
2. **Remove duplicate atom declarations** - Either export from atoms modules or remove from imports
3. **Update index.ts exports** - Ensure all exported atoms actually exist

### Priority 3: Validation and Testing
1. **TypeScript compilation check** - Verify `npx tsc --noEmit` passes
2. **Runtime testing** - Confirm app still functions correctly  
3. **Focus/resize behavior verification** - Test critical user interactions

### Files That Need Changes
- `/src/renderer/src/state/atoms/choices.ts` - Add missing exports
- `/src/renderer/src/state/atoms/actions.ts` - Add missing exports  
- `/src/renderer/src/jotai.ts` - Clean up imports, remove duplicates
- `/src/renderer/src/state/atoms/index.ts` - Verify export consistency

## Token Optimization
- Original comprehensive bundle: 15,566 tokens
- Focused on critical files for TypeScript resolution
- Excluded verbose documentation to focus on code analysis
- Created focused investigation with actionable fix plan

---

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
- Only files matching these patterns are included: src/renderer/src/jotai.ts, src/renderer/src/state/atoms/**, src/renderer/src/state/shared-atoms.ts, circular-deps-refactor-issue.md
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
        shared-atoms.ts
      jotai.ts
circular-deps-refactor-issue.md
```

# Files

## File: src/renderer/src/state/shared-atoms.ts
````typescript
/**
 * Shared atoms that are used by multiple modules.
 * These are placed here to avoid circular dependencies.
 */
import { atom } from 'jotai';
⋮----
// Indicates if the current script is the main script
````

## File: circular-deps-refactor-issue.md
````markdown
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
````

## File: src/renderer/src/state/atoms/chat.ts
````typescript
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
````

## File: src/renderer/src/state/atoms/form.ts
````typescript
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
````

## File: src/renderer/src/state/atoms/input.ts
````typescript
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
````

## File: src/renderer/src/state/atoms/log.ts
````typescript
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
````

## File: src/renderer/src/state/atoms/media.ts
````typescript
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
````

## File: src/renderer/src/state/atoms/scrolling.ts
````typescript
/**
 * Scrolling and list navigation atoms.
 * These atoms manage virtual list scrolling and item navigation.
 */
⋮----
import { atom } from 'jotai';
import type { VariableSizeList } from 'react-window';
⋮----
// Temporary - will be moved when gridReadyAtom is properly placed
````

## File: src/renderer/src/state/atoms/theme.ts
````typescript
/**
 * Theme and appearance atoms.
 * These atoms manage the application's visual theme and color scheme.
 */
⋮----
import { atom } from 'jotai';
⋮----
type Appearance = 'light' | 'dark' | 'auto';
````

## File: src/renderer/src/state/atoms/app-core.ts
````typescript
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
````

## File: src/renderer/src/state/atoms/bounds.ts
````typescript
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
````

## File: src/renderer/src/state/atoms/cache.ts
````typescript
/**
 * Caching atoms for main script state.
 * These atoms store cached data to improve performance when switching between scripts.
 */
⋮----
import type { PromptData, FlagsObject, Shortcut } from '@johnlindquist/kit/types/core';
import type { ScoredChoice } from '../../../../shared/types';
import { UI } from '@johnlindquist/kit/core/enum';
import { atom } from 'jotai';
````

## File: src/renderer/src/state/atoms/editor.ts
````typescript
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
````

## File: src/renderer/src/state/atoms/index.ts
````typescript
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
````

## File: src/renderer/src/state/atoms/script-state.ts
````typescript
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
````

## File: src/renderer/src/state/atoms/tabs.ts
````typescript
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
````

## File: src/renderer/src/state/atoms/terminal.ts
````typescript
/**
 * Terminal state atoms.
 * These atoms manage the terminal emulator configuration and output.
 */
⋮----
import { atom } from 'jotai';
import type { TermConfig } from '../../../../shared/types';
⋮----
// Append output
````

## File: src/renderer/src/state/atoms/utils.ts
````typescript
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
````

## File: src/renderer/src/state/atoms/choices.ts
````typescript
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
````

## File: src/renderer/src/state/atoms/ipc.ts
````typescript
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
````

## File: src/renderer/src/state/atoms/lifecycle.ts
````typescript
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
````

## File: src/renderer/src/state/atoms/actions.ts
````typescript
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
````

## File: src/renderer/src/state/atoms/ui-elements.ts
````typescript
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
````

## File: src/renderer/src/state/atoms/ui.ts
````typescript
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
````

## File: src/renderer/src/state/atoms/preview.ts
````typescript
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
````

## File: src/renderer/src/jotai.ts
````typescript
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
````
