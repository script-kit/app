# Issue Investigation Report

## Issue Summary
The jotai.ts refactoring effort is blocked by circular dependency issues that prevent successful atom extraction. When extracted atoms import from the facade (which re-exports from jotai.ts), it creates circular dependencies that cause build failures. The goal is to reduce jotai.ts from 1690 lines to under 400 lines, but the current facade pattern creates import cycles.

## Investigation Findings

### Critical Circular Dependencies Identified

1. **Facade Pattern Circular Dependency**
   - **Pattern**: Extracted atoms → import from jotai.ts → jotai.ts exports * from extracted atoms
   - **Root Cause**: The facade at `state/atoms/index.ts` re-exports everything from jotai.ts, but extracted atom files import specific atoms back from jotai.ts
   - **Impact**: Creates immediate circular import when any extracted atom tries to use atoms still in jotai.ts

2. **Complex Atom Interdependencies**
   - **channelAtom**: Used by 5+ extracted atom files, but depends on other atoms in jotai.ts
   - **uiAtom**: Referenced by utilities.ts and misc-utils.ts but has complex setter logic
   - **pidAtom**: Used by theme-utils.ts but defined in app-core.ts
   - **Input/Choice Dependencies**: Many atoms need access to input and choice state

3. **Wiring Logic Dependencies**  
   - Atoms in jotai.ts contain complex wiring logic that references extracted atoms
   - The `resize` function is a 200+ line function that touches many atoms
   - Submit logic spans multiple extracted utility atoms

### Dependency Graph Analysis

**High-Risk Atoms (Cannot be safely extracted):**
- `promptDataAtom` - 170 lines of complex state management, central dependency
- `scoredChoicesAtom` - Complex filtering logic, used by many other atoms
- `submitValueAtom` - 100+ lines with dependencies across all modules
- `resize` function - Massive function with DOM dependencies
- `channelAtom` - Central IPC communication hub
- `uiAtom` - Complex setter with side effects

**Medium-Risk Atoms (Partially extractable):**
- Input atoms - Some can be extracted but not the main `inputAtom`
- Choice atoms - Helper atoms extractable, but not core choice management
- Theme atoms - Some utilities can be extracted

**Low-Risk Atoms (Safe to extract):**
- Pure utility functions without cross-dependencies
- Simple state atoms with no complex logic
- Media/webcam atoms with isolated functionality
- Terminal configuration atoms

## Specific Circular Dependency Examples

1. **utilities.ts → jotai.ts cycle**:
   ```typescript
   // utilities.ts
   import { uiAtom, editorAppendAtom, _inputAtom, ... } from '../../jotai';
   
   // jotai.ts
   export * from './state/atoms'; // This includes utilities.ts exports
   ```

2. **theme-utils.ts → jotai.ts cycle**:
   ```typescript
   // theme-utils.ts  
   import { pidAtom, channelAtom } from '../../jotai';
   
   // jotai.ts exports pidAtom via state/atoms which re-exports app-core.ts
   ```

3. **Facade re-export issue**:
   ```typescript
   // state/atoms/index.ts
   export * from './utilities';
   
   // state/facade/index.ts  
   export * from '../../jotai'; // Includes utilities via atoms/index.ts
   export * from '../atoms'; // Direct circular reference
   ```

## Atoms That Are Truly Independent and Safe to Extract

Based on the analysis, these atom categories can be safely extracted:

### ✅ **Immediately Safe (No Dependencies on jotai.ts)**
- **Media atoms**: `webcamStreamAtom` - Isolated functionality
- **Terminal atoms**: `termConfigAtom` - Self-contained
- **Theme constants**: Basic theme values without logic
- **Bounds atoms**: UI boundary calculations
- **Visual flag atoms**: Simple boolean states
- **Editor atoms**: Monaco editor integration (mostly isolated)

### ✅ **Safe with Minimal Refactoring**
- **Basic input atoms**: `_inputAtom`, `_inputChangedAtom` (if moved together)
- **Choice state atoms**: `choices`, `selectedChoicesAtom` (if choice logic stays together)
- **UI element atoms**: Height and visibility atoms
- **Cache atoms**: Simple caching state
- **Script state atoms**: Basic script information

### ❌ **Cannot Be Extracted (Core Dependencies)**
- **Channel/IPC atoms**: Central to all communication
- **Main state atoms**: `promptDataAtom`, `uiAtom`, `scoredChoicesAtom`
- **Submit logic**: Too interconnected
- **Resize logic**: Touches everything
- **Complex derived atoms**: Depend on multiple core atoms

## Specific Recommendations for Breaking Circular Dependencies

### 1. **Eliminate the Facade Pattern (Immediate Fix)**
- **Problem**: The facade creates an immediate circular dependency
- **Solution**: Remove `export * from '../../jotai'` from facade/index.ts
- **Impact**: Components must import directly from jotai.ts or specific atom files
- **Benefit**: Eliminates the primary circular dependency issue

### 2. **Create Dependency Layers (Architectural Fix)**

**Layer 1: Foundation Atoms (No dependencies)**
```typescript
// state/foundation/
export const pidAtom = atom(0);
export const _inputAtom = atom('');
export const _uiAtom = atom(UI.arg);
```

**Layer 2: Domain Atoms (Depend only on Layer 1)**
```typescript
// state/domain/
import { pidAtom } from '../foundation';
export const terminalAtom = atom(/* uses pidAtom */);
```

**Layer 3: Complex Atoms (Depend on Layer 1 & 2)**
```typescript
// jotai.ts (reduced)
import { pidAtom } from './state/foundation';
import { terminalAtom } from './state/domain';
export const promptDataAtom = atom(/* complex logic */);
```

### 3. **Extract Independent Utilities First**
- Start with atoms that have zero dependencies on jotai.ts
- Move media, terminal, and bounds atoms first
- Test build after each extraction
- Gradually move up the dependency chain

### 4. **Create Shared Dependencies Module**
```typescript
// state/shared-dependencies.ts
export { pidAtom, _inputAtom, _uiAtom } from '../jotai';
```

**Benefits:**
- Extracted atoms import from shared-dependencies instead of jotai.ts
- jotai.ts doesn't re-export extracted atoms
- Breaks the circular import cycle
- Clear dependency boundaries

### 5. **Refactor Complex Atoms into Smaller Pieces**
- Break down `promptDataAtom` into smaller, focused atoms
- Extract side effects into separate atoms
- Use composition instead of monolithic atoms
- Consider using atom families for related state

## Implementation Strategy

### Phase 1: Foundation Setup (Immediate)
1. Remove facade pattern exports from jotai.ts
2. Create `state/shared-dependencies.ts` with core atoms
3. Update extracted atoms to import from shared-dependencies
4. Verify build passes

### Phase 2: Safe Extractions (Low Risk)
1. Extract media atoms → `state/atoms/media.ts`
2. Extract terminal atoms → `state/atoms/terminal.ts`  
3. Extract bounds atoms → `state/atoms/bounds.ts`
4. Test build after each extraction

### Phase 3: Domain Extractions (Medium Risk)
1. Extract input atoms (keep related atoms together)
2. Extract choice atoms (maintain coupling where needed)
3. Extract UI element atoms
4. Continuous integration testing

### Phase 4: Complex Refactoring (High Risk)
1. Break down large atoms into smaller pieces
2. Extract side effects from setter functions
3. Create atom families for related state
4. Maintain backward compatibility

## Token Optimization
- Original jotai.ts token count: 17,784 tokens (76.6% of investigation)
- Target reduction: 75% (to ~4,446 tokens)
- Current extracted atoms: 2,673 tokens (11.5% of total)
- Remaining extraction potential: 10,665 tokens

## Next Steps Priority
1. **HIGH**: Remove facade circular dependency (immediate fix)
2. **HIGH**: Create shared-dependencies.ts module
3. **MEDIUM**: Extract foundation atoms (media, terminal, bounds)
4. **MEDIUM**: Establish build validation process
5. **LOW**: Plan complex atom refactoring for Phase 4

---

This file is a merged representation of a subset of the codebase, containing specifically included files, combined into a single document by Repomix.
The content has been processed where line numbers have been added.

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
- Only files matching these patterns are included: src/renderer/src/jotai.ts, src/renderer/src/state/facade/index.ts, src/renderer/src/state/atoms/utilities.ts, src/renderer/src/state/atoms/lifecycle.ts, src/renderer/src/state/atoms/actions-utils.ts, src/renderer/src/state/atoms/theme-utils.ts, src/renderer/src/state/atoms/misc-utils.ts, src/renderer/src/state/atoms/index.ts, src/renderer/src/state/atoms/app-core.ts
- Files matching patterns in .gitignore are excluded
- Files matching default ignore patterns are excluded
- Line numbers have been added to the beginning of each line
- Files are sorted by Git change count (files with more changes are at the bottom)

# Directory Structure
```
src/
  renderer/
    src/
      state/
        atoms/
          actions-utils.ts
          app-core.ts
          index.ts
          lifecycle.ts
          misc-utils.ts
          theme-utils.ts
          utilities.ts
        facade/
          index.ts
      jotai.ts
```

# Files

## File: src/renderer/src/state/atoms/actions-utils.ts
```typescript
 1: /**
 2:  * Action and shortcut utility atoms.
 3:  * Handles keyboard shortcuts, actions, and related functionality.
 4:  */
 5: 
 6: import { atom } from 'jotai';
 7: import { Channel } from '@johnlindquist/kit/core/enum';
 8: import type { Action, Choice } from '@johnlindquist/kit/types/core';
 9: import log from 'electron-log';
10: 
11: // Import dependencies directly from jotai.ts
12: import {
13:   channelAtom,
14:   shortcutsAtom,
15:   enterLastPressedAtom,
16: } from '../../jotai';
17: 
18: // Import from specific location to avoid circular dependency
19: import { editorHistory } from '../atoms/editor';
20: 
21: /**
22:  * Send shortcut atom - handles keyboard shortcut events.
23:  */
24: export const sendShortcutAtom = atom(null, (g, s, shortcut: string) => {
25:   const channel = g(channelAtom);
26:   const hasEnterShortcut = g(shortcutsAtom).find((s) => s.key === 'enter');
27:   log.info('<� Send shortcut', { shortcut, hasEnterShortcut });
28: 
29:   // If 'enter' is pressed and not defined as a specific shortcut, treat it as a submission trigger (tracked via time)
30:   if (shortcut === 'enter' && !hasEnterShortcut) {
31:     s(enterLastPressedAtom, new Date());
32:   } else {
33:     // Otherwise, send it as a shortcut event.
34:     channel(Channel.SHORTCUT, { shortcut });
35:   }
36: });
37: 
38: /**
39:  * Send action atom - handles action button clicks.
40:  */
41: export const sendActionAtom = atom(null, (g, _s, action: Action) => {
42:   const channel = g(channelAtom);
43:   log.info(`=I Sending action: ${action.name}`);
44:   channel(Channel.ACTION, { action });
45: });
46: 
47: /**
48:  * Trigger keyword atom - handles keyword-triggered actions.
49:  */
50: export const triggerKeywordAtom = atom(
51:   (_g) => { },
52:   (
53:     g,
54:     _s,
55:     { keyword, choice }: { keyword: string; choice: Choice },
56:   ) => {
57:     const channel = g(channelAtom);
58:     channel(Channel.KEYWORD_TRIGGERED, {
59:       keyword,
60:       focused: choice,
61:       value: choice?.value,
62:     });
63:   },
64: );
65: 
66: /**
67:  * Get editor history atom - retrieves editor history.
68:  */
69: export const getEditorHistoryAtom = atom((g) => () => {
70:   const channel = g(channelAtom);
71:   channel(Channel.GET_EDITOR_HISTORY, { editorHistory: g(editorHistory) });
72: });
```

## File: src/renderer/src/state/atoms/app-core.ts
```typescript
 1: /**
 2:  * Core application state, configuration, and process management atoms.
 3:  * These atoms handle the fundamental app configuration and lifecycle states.
 4:  */
 5: 
 6: import type { UserDb } from '@johnlindquist/kit/core/db';
 7: import type { ProcessInfo } from '@johnlindquist/kit/types/core';
 8: import { atom } from 'jotai';
 9: 
10: // --- Configuration and Environment ---
11: 
12: export const appConfigAtom = atom({
13:   isWin: false,
14:   isMac: false,
15:   isLinux: false,
16:   os: '',
17:   sep: '',
18:   assetPath: '',
19:   version: '',
20:   delimiter: '',
21:   url: '',
22: } as const);
23: 
24: export const kitConfigAtom = atom({
25:   kitPath: '',
26:   mainScriptPath: '',
27: });
28: 
29: export const userAtom = atom<UserDb>({});
30: 
31: export const _kitStateAtom = atom({
32:   isSponsor: false,
33:   updateDownloaded: false,
34:   promptCount: 0,
35:   noPreview: false,
36:   isMac: false,
37: });
38: 
39: export const kitStateAtom = atom(
40:   (g) => g(_kitStateAtom),
41:   (g, s, a: any) => {
42:     s(_kitStateAtom, {
43:       ...g(_kitStateAtom),
44:       ...a,
45:     });
46:   },
47: );
48: 
49: export const isSponsorAtom = atom(false);
50: export const updateAvailableAtom = atom(false);
51: export const processesAtom = atom<ProcessInfo[]>([]);
52: export const cmdAtom = atom((g) => (g(appConfigAtom).isWin ? 'ctrl' : 'cmd'));
53: 
54: // --- Process and Execution State ---
55: 
56: let currentPid = 0;
57: export const getPid = () => currentPid;
58: const _pidAtom = atom(0);
59: export const pidAtom = atom(
60:   (g) => g(_pidAtom),
61:   (_g, s, a: number) => {
62:     window.pid = a;
63:     s(_pidAtom, a);
64:     currentPid = a;
65:   },
66: );
67: 
68: export const processingAtom = atom(false);
69: export const runningAtom = atom(false);
70: export const submittedAtom = atom(false);
71: 
72: const loading = atom<boolean>(false);
73: export const loadingAtom = atom(
74:   (g) => g(loading) || g(runningAtom),
75:   (_g, s, a: boolean) => {
76:     s(loading, a);
77:   },
78: );
79: 
80: export const progressAtom = atom(0);
81: 
82: // --- Application Lifecycle and Visibility ---
83: 
84: export const isHiddenAtom = atom(false);
85: export const promptActiveAtom = atom(false);
86: export const justOpenedAtom = atom(false);
87: 
88: const isReady = atom(true); // Used primarily for the Splash screen
89: export const isReadyAtom = atom(
90:   (g) => g(isReady),
91:   (_g, s, a: boolean) => {
92:     s(isReady, a);
93:   },
94: );
95: 
96: // --- Caching ---
97: 
98: export const cachedAtom = atom(false);
```

## File: src/renderer/src/state/atoms/misc-utils.ts
```typescript
 1: /**
 2:  * Miscellaneous utility atoms.
 3:  * Simple atoms that don't fit into other categories.
 4:  */
 5: 
 6: import { atom } from 'jotai';
 7: import { Channel, UI } from '@johnlindquist/kit/core/enum';
 8: import { AppChannel } from '../../../../shared/enums';
 9: 
10: // Import dependencies directly from jotai.ts
11: import { channelAtom, uiAtom } from '../../jotai';
12: 
13: const { ipcRenderer } = window.electron;
14: 
15: /**
16:  * Change atom - sends value change events through the channel.
17:  */
18: export const changeAtom = atom((g) => (data: any) => {
19:   const channel = g(channelAtom);
20:   channel(Channel.CHANGE, { value: data });
21: });
22: 
23: /**
24:  * Run main script atom - triggers the main script execution.
25:  */
26: export const runMainScriptAtom = atom(() => () => {
27:   ipcRenderer.send(AppChannel.RUN_MAIN_SCRIPT);
28: });
29: 
30: /**
31:  * Paste event handler atom.
32:  */
33: export const onPasteAtom = atom((g) => (event: ClipboardEvent) => {
34:   if (g(uiAtom) === UI.editor) {
35:     event.preventDefault(); // Assuming we want to handle paste manually or let Monaco handle it
36:   }
37:   const channel = g(channelAtom);
38:   channel(Channel.ON_PASTE);
39: });
40: 
41: /**
42:  * Drop event handler atom.
43:  */
44: export const onDropAtom = atom((g) => (event: DragEvent) => {
45:   if (g(uiAtom) === UI.drop) return; // UI.drop likely has its own specific handler
46:   event.preventDefault();
47:   let drop = '';
48:   const files = Array.from(event?.dataTransfer?.files || []);
49:   if (files.length > 0) {
50:     drop = files
51:       .map((file: File) => (file as any).path)
52:       .join('\n')
53:       .trim();
54:   } else {
55:     drop = event?.dataTransfer?.getData('URL') || event?.dataTransfer?.getData('Text') || '';
56:   }
57:   const channel = g(channelAtom);
58:   channel(Channel.ON_DROP, { drop });
59: });
```

## File: src/renderer/src/state/atoms/theme-utils.ts
```typescript
 1: /**
 2:  * Theme and color utility atoms.
 3:  * Handles color picking and theme-related functionality.
 4:  */
 5: 
 6: import { atom } from 'jotai';
 7: import { Channel } from '@johnlindquist/kit/core/enum';
 8: import * as colorUtils from '@johnlindquist/kit/core/utils';
 9: 
10: // Import dependencies directly from jotai.ts
11: import { pidAtom, channelAtom } from '../../jotai';
12: 
13: const { ipcRenderer } = window.electron;
14: 
15: /**
16:  * Color picker atom using the EyeDropper API.
17:  * Allows user to pick a color from anywhere on the screen.
18:  */
19: export const colorAtom = atom((g) => {
20:   return async () => {
21:     try {
22:       // @ts-ignore -- EyeDropper API might not be in standard TS types yet
23:       const eyeDropper = new EyeDropper();
24:       const { sRGBHex } = await eyeDropper.open();
25: 
26:       const color = colorUtils.convertColor(sRGBHex);
27:       const channel = Channel.GET_COLOR;
28:       const pid = g(pidAtom);
29: 
30:       const appMessage = {
31:         channel,
32:         pid: pid || 0,
33:         value: color,
34:       };
35: 
36:       ipcRenderer.send(channel, appMessage);
37:       return color;
38:     } catch (error) {
39:       // User cancelled or EyeDropper failed
40:       return '';
41:     }
42:   };
43: });
```

## File: src/renderer/src/state/atoms/utilities.ts
```typescript
  1: /**
  2:  * Utility atoms for various helper functions.
  3:  * These atoms provide common functionality used across the app.
  4:  */
  5: 
  6: import { atom } from 'jotai';
  7: import { Channel, UI } from '@johnlindquist/kit/core/enum';
  8: import type { Choice } from '@johnlindquist/kit/types/core';
  9: 
 10: // Import dependencies directly from jotai.ts
 11: import {
 12:   uiAtom,
 13:   editorAppendAtom,
 14:   _inputAtom,
 15:   processingAtom,
 16:   inputAtom,
 17:   _inputChangedAtom,
 18:   hintAtom,
 19:   channelAtom,
 20:   promptActiveAtom,
 21:   submittedAtom,
 22:   selectedChoicesAtom,
 23:   choices,
 24: } from '../../jotai';
 25: 
 26: // Track placeholder timeout
 27: let placeholderTimeoutId: NodeJS.Timeout | null = null;
 28: 
 29: /**
 30:  * Appends text to the current input (text input or editor).
 31:  */
 32: export const appendInputAtom = atom(null, (g, s, a: string) => {
 33:   const ui = g(uiAtom);
 34:   if (ui === UI.editor) {
 35:     s(editorAppendAtom, a);
 36:   } else {
 37:     const input = g(_inputAtom);
 38:     s(_inputAtom, input + a);
 39:   }
 40: });
 41: 
 42: /**
 43:  * Handles validation failure by clearing input and showing hint.
 44:  */
 45: export const valueInvalidAtom = atom(null, (g, s, a: string) => {
 46:   if (placeholderTimeoutId) clearTimeout(placeholderTimeoutId);
 47: 
 48:   s(processingAtom, false);
 49:   s(inputAtom, '');
 50:   s(_inputChangedAtom, false);
 51: 
 52:   if (typeof a === 'string') {
 53:     // hintAtom setter handles the ANSI conversion
 54:     s(hintAtom, a);
 55:   }
 56: 
 57:   const channel = g(channelAtom);
 58:   channel(Channel.ON_VALIDATION_FAILED);
 59: });
 60: 
 61: /**
 62:  * Prevents form submission and resets processing state.
 63:  */
 64: export const preventSubmitAtom = atom(null, (_g, s, _a: string) => {
 65:   s(promptActiveAtom, true);
 66:   if (placeholderTimeoutId) clearTimeout(placeholderTimeoutId);
 67:   s(submittedAtom, false);
 68:   s(processingAtom, false);
 69:   s(_inputChangedAtom, false);
 70: });
 71: 
 72: /**
 73:  * Toggles selection state of a specific choice by ID.
 74:  */
 75: export const toggleSelectedChoiceAtom = atom(null, (g, s, id: string) => {
 76:   const selectedChoices = [...g(selectedChoicesAtom)];
 77:   const scoredChoice = g(choices).find((c) => c?.item?.id === id);
 78:   const index = selectedChoices.findIndex((c) => c?.id === id);
 79: 
 80:   if (index > -1) {
 81:     selectedChoices.splice(index, 1);
 82:   } else if (scoredChoice?.item) {
 83:     selectedChoices.push(scoredChoice.item as Choice);
 84:   }
 85: 
 86:   s(selectedChoicesAtom, selectedChoices);
 87: });
 88: 
 89: /**
 90:  * Toggles selection state of all choices (select all/deselect all).
 91:  */
 92: export const toggleAllSelectedChoicesAtom = atom(null, (g, s) => {
 93:   const selectedChoices = g(selectedChoicesAtom);
 94:   const cs = g(choices).map((c) => c?.item as Choice);
 95: 
 96:   if (selectedChoices.length === cs.length) {
 97:     s(selectedChoicesAtom, []);
 98:   } else {
 99:     s(selectedChoicesAtom, cs);
100:   }
101: });
```

## File: src/renderer/src/state/atoms/index.ts
```typescript
 1: /**
 2:  * Central export file for all modularized atoms.
 3:  * This file re-exports all atoms from their respective modules.
 4:  */
 5: 
 6: // Core application atoms
 7: export * from './app-core';
 8: export * from './lifecycle';
 9: export * from './script-state';
10: export * from '../shared-atoms'; // Export shared atoms including isMainScriptAtom
11: export * from './cache';
12: 
13: // UI and theme atoms
14: export * from './ui-elements';
15: export * from './theme';
16: export * from './ui';
17: export * from './preview';
18: export * from './bounds';
19: 
20: // Input and interaction atoms
21: export * from './input';
22: 
23: // Choice management atoms
24: export * from './choices';
25: 
26: // Actions and flags atoms
27: export * from './actions';
28: 
29: // Component-specific atoms
30: export * from './form';
31: export * from './terminal';
32: export * from './media';
33: export * from './tabs';
34: export * from './scrolling';
35: export * from './editor';
36: export * from './chat';
37: export * from './log';
38: 
39: // IPC and utilities
40: export * from './ipc';
41: export * from './utils';
```

## File: src/renderer/src/state/atoms/lifecycle.ts
```typescript
 1: /**
 2:  * Application lifecycle atoms for open/close state management.
 3:  * These atoms handle the app window visibility lifecycle.
 4:  */
 5: 
 6: import { atom } from 'jotai';
 7: import { pidAtom } from './app-core';
 8: import { mouseEnabledAtom } from './input';
 9: 
10: export const _open = atom(false);
11: 
12: // This will be properly implemented after extracting all dependencies
13: // export const openAtom = atom(
14: //   (g) => g(_open),
15: //   (g, s, a: boolean) => {
16: //     if (g(_open) === a) return;
17: //     
18: //     s(mouseEnabledAtom, 0);
19: //     
20: //     // TODO: Will add reset logic after all atoms are extracted
21: //     if (g(_open) && a === false) {
22: //       // resetPromptState will be added here
23: //     }
24: //     s(_open, a);
25: //   },
26: // ); // Complex version with computed properties is in jotai.ts
27: 
28: // export const exitAtom = atom(
29: //   (g) => g(openAtom),
30: //   (g, s, pid: number) => {
31: //     if (g(pidAtom) === pid) {
32: //       s(openAtom, false);
33: //     }
34: //   },
35: // ); // Complex version with computed properties is in jotai.ts
36: 
37: export const resizeCompleteAtom = atom(false);
```

## File: src/renderer/src/state/facade/index.ts
```typescript
 1: /**
 2:  * Facade for jotai.ts exports.
 3:  * This provides a migration path to gradually move atoms out of jotai.ts
 4:  * while maintaining backward compatibility.
 5:  * 
 6:  * Strategy:
 7:  * 1. Re-export everything from jotai.ts initially
 8:  * 2. Gradually move atoms to feature-specific files
 9:  * 3. Update imports to use this facade
10:  * 4. Eventually remove jotai.ts
11:  */
12: 
13: // Re-export everything from jotai.ts for backward compatibility
14: export * from '../../jotai';
15: 
16: // Note: We've temporarily moved the extracted atoms back to jotai.ts
17: // to avoid build issues. Once we resolve the circular dependencies,
18: // we can re-enable these exports:
19: 
20: // export {
21: //   appendInputAtom,
22: //   valueInvalidAtom,
23: //   preventSubmitAtom,
24: //   toggleSelectedChoiceAtom,
25: //   toggleAllSelectedChoicesAtom,
26: // } from '../atoms/utilities';
27: 
28: // export { colorAtom } from '../atoms/theme-utils';
29: 
30: // export {
31: //   sendShortcutAtom,
32: //   sendActionAtom,
33: //   triggerKeywordAtom,
34: //   getEditorHistoryAtom,
35: // } from '../atoms/actions-utils';
36: 
37: // export {
38: //   changeAtom,
39: //   runMainScriptAtom,
40: //   onPasteAtom,
41: //   onDropAtom,
42: // } from '../atoms/misc-utils';
43: 
44: /**
45:  * Migration tracking:
46:  * 
47:  * ✅ Extracted to other files:
48:  * - Terminal atoms -> state/atoms/terminal.ts
49:  * - UI atoms -> state/atoms/ui.ts
50:  * - Preview atoms -> state/atoms/preview.ts
51:  * - Theme atoms -> state/atoms/theme.ts
52:  * - Actions atoms -> state/atoms/actions.ts
53:  * 
54:  * 🚧 Partially extracted:
55:  * - Choice atoms -> state/atoms/choices.ts (some still in jotai.ts)
56:  * - Input atoms -> state/atoms/input.ts (some still in jotai.ts)
57:  * 
58:  * ❌ Still in jotai.ts (high risk to move):
59:  * - promptDataAtom (complex dependencies)
60:  * - uiAtom (complex logic)
61:  * - scoredChoicesAtom (complex filtering)
62:  * - submitValueAtom (many dependencies)
63:  * - resize logic (DOM dependencies)
64:  * - channel logic (IPC dependencies)
65:  */
```

## File: src/renderer/src/jotai.ts
```typescript
   1: /// <reference path="./env.d.ts" />
   2: 
   3: /**
   4:  * Central Jotai state management file.
   5:  * This file now imports modularized atoms and provides complex wiring logic.
   6:  * Goal: Keep this file under 1000 lines by delegating to modular atoms.
   7:  */
   8: 
   9: // =================================================================================================
  10: // IMPORTS
  11: // =================================================================================================
  12: 
  13: import { Channel, Mode, PROMPT, UI } from '@johnlindquist/kit/core/enum';
  14: import type {
  15:   Action,
  16:   AppState,
  17:   Choice,
  18:   FlagsWithKeys,
  19:   PromptData,
  20:   Script,
  21: } from '@johnlindquist/kit/types/core';
  22: import type {
  23:   AppMessage,
  24: } from '@johnlindquist/kit/types/kitapp';
  25: import { type Getter, type Setter, atom } from 'jotai';
  26: import { debounce, throttle } from 'lodash-es';
  27: import { unstable_batchedUpdates } from 'react-dom';
  28: 
  29: // Import all modularized atoms
  30: export * from './state/atoms';
  31: 
  32: // Import specific atoms we need to wire
  33: import {
  34:   _open,
  35:   _script,
  36:   _inputAtom,
  37:   _inputChangedAtom,
  38:   _flaggedValue,
  39:   _panelHTML,
  40:   _previewHTML,
  41:   _tabIndex,
  42:   _focused,
  43:   _modifiers,
  44:   _lastKeyDownWasModifierAtom,
  45:   _actionsInputAtom,
  46:   _termOutputAtom,
  47:   _chatMessagesAtom,
  48:   _miniShortcutsHoveredAtom,
  49:   _submitValue,
  50:   _indexAtom,
  51:   cachedMainScoredChoicesAtom,
  52:   cachedMainPromptDataAtom,
  53:   cachedMainPreviewAtom,
  54:   cachedMainShortcutsAtom,
  55:   cachedMainFlagsAtom,
  56:   promptData,
  57:   promptReadyAtom,
  58:   choicesReadyAtom,
  59:   choicesConfig,
  60:   prevChoicesConfig,
  61:   choices,
  62:   prevScoredChoicesIdsAtom,
  63:   choicesAtom,
  64:   selectedChoicesAtom,
  65:   flagsAtom,
  66:   scoredFlags,
  67:   flagsIndex,
  68:   focusedFlagValueAtom,
  69:   focusedActionAtom,
  70:   shortcutsAtom,
  71:   _ui,
  72:   modeAtom,
  73:   enterAtom,
  74:   nameAtom,
  75:   descriptionAtom,
  76:   tabsAtom,
  77:   previewHTMLAtom,
  78:   panelHTMLAtom,
  79:   formHTMLAtom,
  80:   logHTMLAtom,
  81:   logLinesAtom,
  82:   termConfigAtom,
  83:   editorConfigAtom,
  84:   editorCursorPosAtom,
  85:   editorHistory,
  86:   webcamStreamAtom,
  87:   pidAtom,
  88:   processingAtom,
  89:   runningAtom,
  90:   submittedAtom,
  91:   loadingAtom,
  92:   progressAtom,
  93:   isHiddenAtom,
  94:   promptActiveAtom,
  95:   mouseEnabledAtom,
  96:   resizeCompleteAtom,
  97:   audioDotAtom,
  98:   disableSubmitAtom,
  99:   pauseChannelAtom,
 100:   kitConfigAtom,
 101:   appConfigAtom,
 102:   themeAtom,
 103:   tempThemeAtom,
 104:   itemHeightAtom,
 105:   inputHeightAtom,
 106:   _mainHeight,
 107:   choicesHeightAtom,
 108:   flagsHeightAtom,
 109:   actionsItemHeightAtom,
 110:   gridReadyAtom,
 111:   listAtom,
 112:   flagsListAtom,
 113:   scrollToIndexAtom,
 114:   requiresScrollAtom,
 115:   promptBoundsAtom,
 116:   isWindowAtom,
 117:   justOpenedAtom,
 118:   isSplashAtom,
 119:   isMainScriptAtom,
 120:   defaultChoiceIdAtom,
 121:   defaultValueAtom,
 122:   prevIndexAtom,
 123:   directionAtom,
 124:   hasSkipAtom,
 125:   allSkipAtom,
 126:   actionsInputAtom,
 127:   inputFocusAtom,
 128:   hintAtom,
 129:   placeholderAtom,
 130:   selectedAtom,
 131:   tabChangedAtom,
 132:   inputWhileSubmittedAtom,
 133:   lastKeyDownWasModifierAtom,
 134:   enterLastPressedAtom,
 135:   closedInput,
 136:   lastScriptClosed,
 137:   logoAtom,
 138:   preloadedAtom,
 139:   backToMainAtom,
 140:   choiceInputsAtom,
 141:   editorAppendAtom,
 142:   editorHistoryPush,
 143:   termOutputAtom,
 144:   formDataAtom,
 145:   footerAtom,
 146:   containerClassNameAtom,
 147:   headerHiddenAtom,
 148:   footerHiddenAtom,
 149:   actionsConfigAtom,
 150:   onInputSubmitAtom,
 151:   defaultActionsIdAtom,
 152:   hasRightShortcutAtom,
 153:   previewEnabledAtom,
 154:   previewCheckAtom,
 155:   promptResizedByHumanAtom,
 156:   scrollToItemAtom,
 157:   flagsRequiresScrollAtom,
 158:   currentChoiceHeightsAtom,
 159:   prevMh,
 160:   cachedAtom,
 161: } from './state/atoms';
 162: 
 163: 
 164: // Shared imports
 165: import { DEFAULT_HEIGHT, closedDiv, noChoice } from '../../shared/defaults';
 166: import { AppChannel } from '../../shared/enums';
 167: import type { ResizeData, ScoredChoice, TermConfig as SharedTermConfig } from '../../shared/types';
 168: import { formatShortcut } from './components/formatters';
 169: import { createLogger } from './log-utils';
 170: import { arraysEqual, colorUtils, dataUtils, domUtils } from './utils/state-utils';
 171: import { removeTopBorderOnFirstItem, calcVirtualListHeight } from './state/utils';
 172: import { advanceIndexSkipping } from './state/skip-nav';
 173: import { computeResize } from './state/resize/compute';
 174: import {
 175:   SCROLL_THROTTLE_MS,
 176:   PREVIEW_THROTTLE_MS,
 177:   RESIZE_DEBOUNCE_MS,
 178:   SEND_RESIZE_DEBOUNCE_MS,
 179:   JUST_OPENED_MS,
 180:   PROCESSING_SPINNER_DELAY_MS,
 181:   MAX_VLIST_HEIGHT,
 182:   MAX_TABCHECK_ATTEMPTS,
 183: } from './state/constants';
 184: import {
 185:   ID_HEADER,
 186:   ID_FOOTER,
 187:   ID_MAIN,
 188:   ID_LIST,
 189:   ID_PANEL,
 190:   ID_WEBCAM,
 191:   ID_LOG,
 192: } from './state/dom-ids';
 193: 
 194: const { ipcRenderer } = window.electron;
 195: const log = createLogger('jotai.ts');
 196: 
 197: // =================================================================================================
 198: // COMPLEX WIRING LOGIC
 199: // This section contains the complex atom wiring that couldn't be easily extracted
 200: // =================================================================================================
 201: 
 202: let placeholderTimeoutId: NodeJS.Timeout;
 203: let choicesPreloaded = false;
 204: let wereChoicesPreloaded = false;
 205: let wasPromptDataPreloaded = false;
 206: let prevFocusedChoiceId = 'prevFocusedChoiceId';
 207: let prevChoiceIndexId = 'prevChoiceIndexId';
 208: let prevTopHeight = 0;
 209: 
 210: // --- Open/Close Lifecycle with Reset ---
 211: export const openAtom = atom(
 212:   (g) => g(_open),
 213:   (g, s, a: boolean) => {
 214:     if (g(_open) === a) return;
 215: 
 216:     s(mouseEnabledAtom, 0);
 217: 
 218:     if (g(_open) && a === false) {
 219:       // Reset prompt state on close
 220:       s(resizeCompleteAtom, false);
 221:       s(lastScriptClosed, g(_script).filePath);
 222:       s(closedInput, g(_inputAtom));
 223:       s(_panelHTML, '');
 224:       s(formHTMLAtom, '');
 225:       s(logHTMLAtom, '');
 226:       s(flagsAtom, {});
 227:       s(_flaggedValue, '');
 228:       s(loadingAtom, false);
 229:       s(progressAtom, 0);
 230:       s(editorConfigAtom, {});
 231:       s(promptDataAtom, null);
 232:       s(requiresScrollAtom, -1);
 233:       s(pidAtom, 0);
 234:       s(_chatMessagesAtom, []);
 235:       s(runningAtom, false);
 236:       s(_miniShortcutsHoveredAtom, false);
 237:       s(logLinesAtom, []);
 238:       s(audioDotAtom, false);
 239:       s(disableSubmitAtom, false);
 240:       g(scrollToIndexAtom)(0);
 241:       s(termConfigAtom, {});
 242: 
 243:       // Cleanup media streams
 244:       const stream = g(webcamStreamAtom);
 245:       if (stream && 'getTracks' in stream) {
 246:         (stream as MediaStream).getTracks().forEach((track) => track.stop());
 247:         s(webcamStreamAtom, null);
 248:         const webcamEl = document.getElementById(ID_WEBCAM) as HTMLVideoElement;
 249:         if (webcamEl) {
 250:           webcamEl.srcObject = null;
 251:         }
 252:       }
 253:     }
 254:     s(_open, a);
 255:   },
 256: );
 257: 
 258: export const exitAtom = atom(
 259:   (g) => g(openAtom),
 260:   (g, s, pid: number) => {
 261:     if (g(pidAtom) === pid) {
 262:       s(openAtom, false);
 263:     }
 264:   },
 265: );
 266: 
 267: // --- Script Atom with Complex Logic ---
 268: export const scriptAtom = atom(
 269:   (g) => g(_script),
 270:   (g, s, a: Script) => {
 271:     s(lastKeyDownWasModifierAtom, false);
 272: 
 273:     const mainScriptPath = g(kitConfigAtom).mainScriptPath;
 274:     const isMainScript = a?.filePath === mainScriptPath;
 275:     const prevScript = g(_script);
 276: 
 277:     s(isMainScriptAtom, isMainScript);
 278:     s(backToMainAtom, prevScript?.filePath !== mainScriptPath && isMainScript);
 279:     s(promptReadyAtom, false);
 280: 
 281:     if (!isMainScript) {
 282:       s(choicesConfigAtom, { preload: false });
 283:       const preloaded = g(preloadedAtom);
 284:       log.info(`${g(pidAtom)}: Preloaded? ${preloaded ? 'YES' : 'NO'}`);
 285: 
 286:       if (!preloaded) {
 287:         s(_previewHTML, '');
 288:       }
 289:     }
 290: 
 291:     s(preloadedAtom, false);
 292:     if (a?.tabs) {
 293:       s(tabsAtom, a?.tabs || []);
 294:     }
 295: 
 296:     s(mouseEnabledAtom, 0);
 297:     s(_script, a);
 298:     s(processingAtom, false);
 299:     s(loadingAtom, false);
 300:     s(progressAtom, 0);
 301:     s(logoAtom, a?.logo || '');
 302:     s(tempThemeAtom, g(themeAtom));
 303:   },
 304: );
 305: 
 306: // --- PromptData Atom with Complex State Management ---
 307: export const promptDataAtom = atom(
 308:   (g) => g(promptData),
 309:   (g, s, a: null | PromptData) => {
 310:     if (!a) {
 311:       s(promptData, null);
 312:       return;
 313:     }
 314: 
 315:     s(choicesReadyAtom, false);
 316:     const pid = g(pidAtom);
 317:     s(gridReadyAtom, false);
 318: 
 319:     const isMainScript = a.scriptPath === g(kitConfigAtom).mainScriptPath;
 320:     s(isMainScriptAtom, isMainScript);
 321: 
 322:     if (isMainScript && !a.preload && g(tabIndexAtom) === 0) {
 323:       s(cachedMainPromptDataAtom, a);
 324:     }
 325: 
 326:     if (a.ui !== UI.arg && !a.preview) {
 327:       s(previewHTMLAtom, closedDiv);
 328:     }
 329: 
 330:     s(isHiddenAtom, false);
 331:     const prevPromptData = g(promptData);
 332: 
 333:     wasPromptDataPreloaded = Boolean(prevPromptData?.preload && !a.preload);
 334:     log.info(
 335:       `${pid}: 👀 Preloaded: ${a.scriptPath} ${wasPromptDataPreloaded} Keyword: ${a.keyword}`,
 336:     );
 337: 
 338:     if (!prevPromptData && a) {
 339:       s(justOpenedAtom, true);
 340:       setTimeout(() => s(justOpenedAtom, false), JUST_OPENED_MS);
 341:     } else {
 342:       s(justOpenedAtom, false);
 343:     }
 344: 
 345:     if (prevPromptData?.ui === UI.editor && g(_inputChangedAtom)) {
 346:       s(editorHistoryPush, g(closedInput));
 347:     }
 348: 
 349:     s(_inputChangedAtom, false);
 350: 
 351:     if (a.ui !== UI.arg) {
 352:       s(focusedChoiceAtom, noChoice);
 353:     }
 354:     s(uiAtom, a.ui);
 355:     s(_open, true);
 356:     s(submittedAtom, false);
 357: 
 358:     // Clear loading timeout when new prompt opens
 359:     if (placeholderTimeoutId) {
 360:       clearTimeout(placeholderTimeoutId);
 361:       s(loadingAtom, false);
 362:       s(processingAtom, false);
 363:     }
 364: 
 365:     if (a.ui === UI.term) {
 366:       const b: any = a;
 367:       const config: SharedTermConfig = {
 368:         promptId: a.id,
 369:         command: b?.input || '',
 370:         cwd: b?.cwd || '',
 371:         env: b?.env || {},
 372:         shell: b?.shell,
 373:         args: b?.args || [],
 374:         closeOnExit: typeof b?.closeOnExit !== 'undefined' ? b.closeOnExit : true,
 375:         pid: g(pidAtom),
 376:       };
 377:       s(termConfigAtom, config);
 378:     }
 379: 
 380:     if (!(a.keyword || (g(isMainScriptAtom) && a.ui === UI.arg))) {
 381:       const inputWhileSubmitted = g(inputWhileSubmittedAtom);
 382:       const forceInput = a.input || inputWhileSubmitted || '';
 383:       log.info(`${pid}: 👂 Force input due to keyword or mainScript`);
 384: 
 385:       const prevInput = g(_inputAtom);
 386:       const prevInputHasSlash = prevInput.includes('/') || prevInput.includes('\\');
 387: 
 388:       if (forceInput && (!prevInput.startsWith(forceInput) || prevInputHasSlash)) {
 389:         s(_inputAtom, forceInput);
 390:       } else if (!forceInput) {
 391:         s(_inputAtom, forceInput);
 392:       }
 393:     }
 394: 
 395:     s(inputWhileSubmittedAtom, '');
 396:     s(_flaggedValue, '');
 397:     s(hintAtom, a.hint);
 398:     s(placeholderAtom, a.placeholder);
 399:     s(selectedAtom, a.selected);
 400:     s(tabsAtom, a.tabs);
 401:     s(processingAtom, false);
 402:     s(focusedFlagValueAtom, '');
 403:     s(flagsAtom, a.flags || {});
 404:     s(choiceInputsAtom, []);
 405: 
 406:     s(headerHiddenAtom, !!a.headerClassName?.includes('hidden'));
 407:     s(footerHiddenAtom, !!a.footerClassName?.includes('hidden'));
 408:     s(containerClassNameAtom, a.containerClassName || '');
 409: 
 410:     const script = g(scriptAtom);
 411:     const promptDescription = a.description || (a.name ? '' : script?.description || '');
 412:     const promptName = a.name || script?.name || '';
 413:     s(descriptionAtom, promptDescription || promptName);
 414:     s(nameAtom, promptDescription ? promptName : promptDescription);
 415: 
 416:     if (!a.keepPreview && a.preview) {
 417:       s(previewHTMLAtom, a.preview);
 418:     }
 419: 
 420:     // Match main branch behavior exactly - only set panel if a.panel exists
 421:     if (a.panel) {
 422:       s(panelHTMLAtom, a.panel);
 423:     }
 424: 
 425:     if (typeof a.footer === 'string') {
 426:       s(footerAtom, a.footer);
 427:     }
 428:     s(defaultChoiceIdAtom, a.defaultChoiceId || '');
 429:     s(defaultValueAtom, a.defaultValue || '');
 430: 
 431:     if (a.html) {
 432:       s(formHTMLAtom, domUtils.ensureFormHasSubmit(a.html));
 433:     }
 434:     if (a.formData) {
 435:       s(formDataAtom, a.formData);
 436:     }
 437: 
 438:     s(itemHeightAtom, a.itemHeight || PROMPT.ITEM.HEIGHT.SM);
 439:     s(inputHeightAtom, a.inputHeight || PROMPT.INPUT.HEIGHT.SM);
 440: 
 441:     s(onInputSubmitAtom, a.shortcodes || {});
 442:     s(shortcutsAtom, a.shortcuts || []);
 443:     s(actionsConfigAtom, a.actionsConfig || {});
 444: 
 445:     s(prevChoicesConfig, { preload: false });
 446:     s(audioDotAtom, false);
 447: 
 448:     if (a.choicesType === 'async') {
 449:       s(loadingAtom, true);
 450:     }
 451: 
 452:     if (typeof a.enter === 'string') {
 453:       s(enterAtom, a.enter);
 454:     } else {
 455:       s(enterAtom, 'Submit');
 456:     }
 457: 
 458:     if (!g(hasActionsAtom)) {
 459:       s(flagsHeightAtom, 0);
 460:     }
 461: 
 462:     s(promptData, a);
 463: 
 464:     const channel = g(channelAtom);
 465:     channel(Channel.ON_INIT);
 466: 
 467:     ipcRenderer.send(Channel.SET_PROMPT_DATA, {
 468:       messageId: (a as any).messageId,
 469:       ui: a.ui,
 470:     });
 471: 
 472:     s(promptReadyAtom, true);
 473:     s(promptActiveAtom, true);
 474:     s(tabChangedAtom, false);
 475:     s(actionsInputAtom, '');
 476:     s(_termOutputAtom, '');
 477:   },
 478: );
 479: 
 480: // --- Input Atom with Complex Logic ---
 481: export const inputAtom = atom(
 482:   (g) => g(_inputAtom),
 483:   async (g, s, a: string) => {
 484:     s(directionAtom, 1);
 485:     const selected = g(showSelectedAtom);
 486:     const prevInput = g(_inputAtom);
 487: 
 488:     if (prevInput && a === '') {
 489:       s(selected ? flagsIndexAtom : indexAtom, 0);
 490:     }
 491: 
 492:     if (a !== prevInput) {
 493:       s(_inputChangedAtom, true);
 494:     } else {
 495:       s(tabChangedAtom, false);
 496:       return;
 497:     }
 498: 
 499:     s(_inputAtom, a);
 500: 
 501:     if (!g(submittedAtom)) {
 502:       const channel = g(channelAtom);
 503:       channel(Channel.INPUT);
 504:     }
 505: 
 506:     s(mouseEnabledAtom, 0);
 507: 
 508:     if (selected) {
 509:       s(selected ? flagsIndexAtom : indexAtom, 0);
 510:     }
 511: 
 512:     const mode = g(modeAtom);
 513:     const flaggedValue = g(flaggedChoiceValueAtom);
 514: 
 515:     if (g(tabChangedAtom) && a && prevInput !== a) {
 516:       s(tabChangedAtom, false);
 517:       return;
 518:     }
 519: 
 520:     if (mode === Mode.GENERATE && !flaggedValue) {
 521:       s(loadingAtom, true);
 522:     }
 523: 
 524:     if (g(_inputChangedAtom) && a === '') {
 525:       resize(g, s, 'INPUT_CLEARED');
 526:     }
 527:   },
 528: );
 529: 
 530: // --- Choices Configuration ---
 531: export const choicesConfigAtom = atom(
 532:   (g) => g(choicesConfig),
 533:   (g, s, a: { preload: boolean }) => {
 534:     wereChoicesPreloaded = !a?.preload && choicesPreloaded;
 535:     choicesPreloaded = a?.preload;
 536:     s(directionAtom, 1);
 537: 
 538:     const promptData = g(promptDataAtom);
 539:     const focusedChoice = g(focusedChoiceAtom);
 540: 
 541:     if (focusedChoice?.name !== noChoice?.name && !focusedChoice?.hasPreview && !promptData?.preview) {
 542:       s(previewHTMLAtom, closedDiv);
 543:     }
 544: 
 545:     s(loadingAtom, false);
 546: 
 547:     const preloaded = g(preloadedAtom);
 548:     if (preloaded) {
 549:       const nextIndex = g(scoredChoicesAtom).findIndex((sc) => sc.item.id === g(defaultChoiceIdAtom));
 550:       s(indexAtom, nextIndex > 0 ? nextIndex : 0);
 551:     }
 552:   },
 553: );
 554: 
 555: // --- Tab Index ---
 556: let sendTabChanged: () => void;
 557: const getSendTabChanged = (g: Getter) =>
 558:   debounce(
 559:     () => {
 560:       const channel = g(channelAtom);
 561:       channel(Channel.TAB_CHANGED);
 562:     },
 563:     100,
 564:     { leading: true, trailing: true },
 565:   );
 566: 
 567: export const tabIndexAtom = atom(
 568:   (g) => g(_tabIndex),
 569:   (g, s, a: number) => {
 570:     s(_inputChangedAtom, false);
 571:     s(prevIndexAtom, 0);
 572: 
 573:     if (g(_tabIndex) !== a) {
 574:       s(_tabIndex, a);
 575:       s(flagsAtom, {});
 576:       s(_flaggedValue, '');
 577: 
 578:       sendTabChanged = sendTabChanged || getSendTabChanged(g);
 579:       sendTabChanged();
 580: 
 581:       s(tabChangedAtom, true);
 582:     }
 583:   },
 584: );
 585: 
 586: // --- UI Atom ---
 587: export const uiAtom = atom(
 588:   (g) => g(_ui),
 589:   (g, s, a: UI) => {
 590:     s(_ui, a);
 591: 
 592:     if ([UI.arg, UI.textarea, UI.hotkey, UI.splash].includes(a)) {
 593:       s(inputFocusAtom, Math.random());
 594:     }
 595: 
 596:     if ([UI.splash, UI.term, UI.editor, UI.hotkey].includes(a)) {
 597:       s(enterAtom, '');
 598:     }
 599: 
 600:     if (a !== UI.arg && g(scoredChoicesAtom)?.length > 0) {
 601:       s(scoredChoicesAtom, []);
 602:     }
 603: 
 604:     // Side effects moved to UIController
 605:     // The UIController now handles:
 606:     // - Checking for DOM element availability  
 607:     // - Sending IPC messages when UI changes
 608:   },
 609: );
 610: 
 611: // --- Scored Choices with Complex Logic ---
 612: export const scoredChoicesAtom = atom(
 613:   (g) => g(choices),
 614:   (g, s, cs: ScoredChoice[] = []) => {
 615:     s(choicesReadyAtom, true);
 616:     s(cachedAtom, false);
 617:     s(loadingAtom, false);
 618:     prevFocusedChoiceId = 'prevFocusedChoiceId';
 619: 
 620:     const csIds = cs.map((c) => c.item.id) as string[];
 621:     const prevIds = g(prevScoredChoicesIdsAtom);
 622:     const changed = !arraysEqual(prevIds, csIds);
 623:     s(prevScoredChoicesIdsAtom, csIds);
 624: 
 625:     removeTopBorderOnFirstItem(cs);
 626: 
 627:     s(choices, cs || []);
 628:     s(currentChoiceHeightsAtom, cs || []);
 629: 
 630:     if (g(promptData)?.grid) {
 631:       s(gridReadyAtom, true);
 632:     }
 633: 
 634:     let hasSkip = false;
 635:     let allSkip = cs.length > 0;
 636:     let allInfo = cs.length > 0;
 637:     let allSkipOrInfo = cs.length > 0;
 638: 
 639:     for (const c of cs) {
 640:       const isSkipped = c?.item?.skip;
 641:       const isInfo = c?.item?.info;
 642:       if (isSkipped) hasSkip = true;
 643:       if (!isSkipped) allSkip = false;
 644:       if (!isInfo) allInfo = false;
 645:       if (!(isSkipped || isInfo)) allSkipOrInfo = false;
 646: 
 647:       if (hasSkip && !allSkip && !allInfo && !allSkipOrInfo) break;
 648:     }
 649: 
 650:     s(hasSkipAtom, hasSkip);
 651:     s(allSkipAtom, allSkip);
 652: 
 653:     if (changed) {
 654:       s(indexAtom, 0);
 655:     }
 656: 
 657:     const isFilter = g(uiAtom) === UI.arg && g(promptData)?.mode === Mode.FILTER;
 658:     const channel = g(channelAtom);
 659:     const hasActionableChoices = !allSkipOrInfo && cs.length > 0;
 660: 
 661:     if (hasActionableChoices) {
 662:       s(panelHTMLAtom, '');
 663: 
 664:       const defaultValue: any = g(defaultValueAtom);
 665:       const defaultChoiceId = g(defaultChoiceIdAtom);
 666:       const prevIndex = g(prevIndexAtom);
 667:       const input = g(inputAtom);
 668: 
 669:       if (defaultValue || defaultChoiceId) {
 670:         const i = cs.findIndex(
 671:           (c) => c.item?.id === defaultChoiceId || c.item?.value === defaultValue || c.item?.name === defaultValue,
 672:         );
 673: 
 674:         if (i !== -1) {
 675:           const foundChoice = cs[i].item;
 676:           if (foundChoice?.id) {
 677:             s(indexAtom, i);
 678:             s(focusedChoiceAtom, foundChoice);
 679:             s(requiresScrollAtom, i);
 680:           }
 681:         }
 682:         s(defaultValueAtom, '');
 683:         s(defaultChoiceIdAtom, '');
 684:       } else if (input.length > 0) {
 685:         s(requiresScrollAtom, g(requiresScrollAtom) > 0 ? 0 : -1);
 686:         if (changed) {
 687:           s(indexAtom, 0);
 688:         }
 689:       } else if (prevIndex && !g(selectedAtom)) {
 690:         let adjustForGroup = prevIndex;
 691:         if (cs?.[prevIndex - 1]?.item?.skip) {
 692:           adjustForGroup -= 1;
 693:         }
 694:         s(requiresScrollAtom, wereChoicesPreloaded ? -1 : adjustForGroup);
 695:       } else {
 696:         s(requiresScrollAtom, wereChoicesPreloaded ? -1 : 0);
 697:       }
 698:     } else {
 699:       s(focusedChoiceAtom, noChoice);
 700:       if (isFilter && Boolean(cs) && g(promptReadyAtom)) {
 701:         channel(Channel.NO_CHOICES);
 702:       }
 703:     }
 704: 
 705:     const itemHeight = g(itemHeightAtom);
 706:     const choicesHeight = calcVirtualListHeight(cs as any, itemHeight, MAX_VLIST_HEIGHT);
 707: 
 708:     s(choicesHeightAtom, choicesHeight);
 709: 
 710:     // Adjust main height based on UI mode
 711:     const ui = g(uiAtom);
 712:     if (ui === UI.arg) {
 713:       s(mainHeightAtom, choicesHeight);
 714:     } else {
 715:       s(mainHeightAtom, DEFAULT_HEIGHT);
 716:     }
 717:   },
 718: );
 719: 
 720: // --- Index Atom with Skip Logic ---
 721: export const indexAtom = atom(
 722:   (g) => g(_indexAtom),
 723:   (g, s, a: number) => {
 724:     if (g(flaggedChoiceValueAtom) || g(submittedAtom)) return;
 725: 
 726:     const cs = g(choices);
 727:     if (cs.length === 0) {
 728:       s(_indexAtom, 0);
 729:       return;
 730:     }
 731: 
 732:     const clampedIndex = a < 0 ? cs.length - 1 : a >= cs.length ? 0 : a;
 733: 
 734:     const list = g(listAtom);
 735:     const requiresScroll = g(requiresScrollAtom);
 736:     const direction = g(directionAtom);
 737: 
 738:     let calcIndex = clampedIndex;
 739:     let choice = cs?.[calcIndex]?.item;
 740: 
 741:     if (choice?.id === prevChoiceIndexId) return;
 742: 
 743:     if (g(allSkipAtom)) {
 744:       s(focusedChoiceAtom, noChoice);
 745:       if (!g(promptDataAtom)?.preview) {
 746:         s(previewHTMLAtom, closedDiv);
 747:       }
 748:       return;
 749:     }
 750: 
 751:     if (choice?.skip) {
 752:       calcIndex = advanceIndexSkipping(clampedIndex, direction, cs as any);
 753:       choice = cs[calcIndex]?.item;
 754:     }
 755: 
 756:     prevChoiceIndexId = choice?.id || 'prevChoiceIndexId';
 757: 
 758:     if (g(_indexAtom) !== calcIndex) {
 759:       s(_indexAtom, calcIndex);
 760:     }
 761: 
 762:     const gridReady = g(gridReadyAtom);
 763:     if (list && !gridReady) {
 764:       if (cs[0]?.item?.skip && calcIndex === 1) {
 765:         s(scrollToItemAtom, { index: 0, reason: 'indexAtom - skip adjustment' });
 766:       } else if (requiresScroll === -1) {
 767:         s(scrollToItemAtom, { index: calcIndex, reason: 'indexAtom - requiresScroll === -1' });
 768:       }
 769:     }
 770: 
 771:     const id = choice?.id;
 772:     if (id) {
 773:       s(focusedChoiceAtom, choice);
 774:       if (typeof choice?.preview === 'string') {
 775:         s(previewHTMLAtom, choice?.preview);
 776:       }
 777:     }
 778:   },
 779: );
 780: 
 781: // --- Focused Choice with Throttling ---
 782: // Throttled focus logic moved to ChoicesController
 783: // The controller handles:
 784: // - Throttling focus changes
 785: // - Updating preview HTML
 786: // - Sending IPC messages
 787: // - Managing prevFocusedChoiceId
 788: 
 789: export const focusedChoiceAtom = atom(
 790:   (g) => g(_focused),
 791:   (g, s, choice: Choice) => {
 792:     // Simple setter - side effects handled by ChoicesController
 793:     s(_focused, choice || noChoice);
 794:   }
 795: );
 796: 
 797: // --- Flagged Choice Value ---
 798: export const flaggedChoiceValueAtom = atom(
 799:   (g) => g(_flaggedValue),
 800:   (g, s, a: any) => {
 801:     const currentFlaggedValue = g(_flaggedValue);
 802: 
 803:     if (currentFlaggedValue && a === 'action') {
 804:       log.info('👀 flaggedChoiceValueAtom: clearing actionsInputAtom because it was already open');
 805:       s(actionsInputAtom, '');
 806:       return;
 807:     }
 808: 
 809:     s(promptActiveAtom, true);
 810:     log.info({ flagValue: a });
 811:     s(_flaggedValue, a);
 812: 
 813:     if (a === '') {
 814:       s(selectedAtom, '');
 815:       s(choicesConfigAtom, g(prevChoicesConfig));
 816:       s(indexAtom, g(prevIndexAtom));
 817:       s(actionsInputAtom, '');
 818:     } else {
 819:       s(selectedAtom, typeof a === 'string' ? a : (a as Choice)?.name);
 820:       s(prevIndexAtom, g(indexAtom));
 821:       s(directionAtom, 1);
 822:       s(flagsIndexAtom, 0);
 823:     }
 824: 
 825:     const channel = g(channelAtom);
 826:     channel(Channel.ON_MENU_TOGGLE);
 827:     resize(g, s, 'FLAG_VALUE');
 828:   },
 829: );
 830: 
 831: // --- Scored Flags ---
 832: export const scoredFlagsAtom = atom(
 833:   (g) => {
 834:     if (!g(hasActionsAtom)) return [];
 835:     return g(scoredFlags);
 836:   },
 837:   (g, s, a: ScoredChoice[]) => {
 838:     unstable_batchedUpdates(() => {
 839:       s(scoredFlags, a);
 840:       s(flagsIndexAtom, 0);
 841: 
 842:       removeTopBorderOnFirstItem(a);
 843: 
 844:       const defaultActionId = g(defaultActionsIdAtom);
 845:       if (defaultActionId) {
 846:         const defaultActionIndex = a.findIndex((c) => c?.item?.id === defaultActionId);
 847:         s(flagsIndexAtom, defaultActionIndex > -1 ? defaultActionIndex : 0);
 848:       }
 849: 
 850:       requestAnimationFrame(() => {
 851:         const itemHeight = g(actionsItemHeightAtom);
 852:         const height = calcVirtualListHeight(a as any, itemHeight, MAX_VLIST_HEIGHT);
 853:         s(flagsHeightAtom, height);
 854:       });
 855:     });
 856:   },
 857: );
 858: 
 859: // --- Flags Index ---
 860: export const flagsIndexAtom = atom(
 861:   (g) => g(flagsIndex),
 862:   (g, s, a: number) => {
 863:     const flagValue = g(flaggedChoiceValueAtom);
 864:     if (!flagValue) {
 865:       s(focusedFlagValueAtom, '');
 866:       return;
 867:     }
 868: 
 869:     const cs = g(scoredFlagsAtom);
 870:     if (cs.length === 0) {
 871:       s(flagsIndex, 0);
 872:       return;
 873:     }
 874: 
 875:     const clampedIndex = a < 0 ? cs.length - 1 : a >= cs.length ? 0 : a;
 876: 
 877:     const list = g(flagsListAtom);
 878:     const requiresScroll = g(flagsRequiresScrollAtom);
 879:     const direction = g(directionAtom);
 880: 
 881:     let calcIndex = clampedIndex;
 882:     let choice = cs?.[calcIndex]?.item;
 883: 
 884:     if (choice?.skip) {
 885:       calcIndex = advanceIndexSkipping(clampedIndex, direction, cs as any);
 886:       choice = cs[calcIndex]?.item;
 887:     }
 888: 
 889:     if (g(flagsIndex) !== calcIndex) {
 890:       s(flagsIndex, calcIndex);
 891:     }
 892: 
 893:     if (list) {
 894:       if (requiresScroll === -1) {
 895:         list.scrollToItem(calcIndex);
 896:       }
 897:       if (cs[0]?.item?.skip && calcIndex === 1) {
 898:         list.scrollToItem(0);
 899:       }
 900:     }
 901: 
 902:     const focusedFlag = (choice as Choice)?.value;
 903:     s(focusedFlagValueAtom, focusedFlag);
 904:   },
 905: );
 906: 
 907: // --- Resize Logic ---
 908: const sendResize = (data: ResizeData) => ipcRenderer.send(AppChannel.RESIZE, data);
 909: const debounceSendResize = debounce(sendResize, SEND_RESIZE_DEBOUNCE_MS);
 910: 
 911: export const resize = debounce(
 912:   (g: Getter, s: Setter, reason = 'UNSET') => {
 913:     const human = g(promptResizedByHumanAtom);
 914:     if (human) {
 915:       g(channelAtom)(Channel.SET_BOUNDS, g(promptBoundsAtom));
 916:       return;
 917:     }
 918: 
 919:     const active = g(promptActiveAtom);
 920:     if (!active) return;
 921: 
 922:     const promptData = g(promptDataAtom);
 923:     if (!promptData?.scriptPath) return;
 924: 
 925:     const ui = g(uiAtom);
 926:     const scoredChoicesLength = g(scoredChoicesAtom)?.length;
 927:     const hasPanel = g(_panelHTML) !== '';
 928:     let mh = g(mainHeightAtom);
 929: 
 930:     if (promptData?.grid && document.getElementById(ID_MAIN)?.clientHeight > 10) {
 931:       return;
 932:     }
 933: 
 934:     const placeholderOnly = promptData?.mode === Mode.FILTER && scoredChoicesLength === 0 && ui === UI.arg;
 935:     const topHeight = document.getElementById(ID_HEADER)?.offsetHeight || 0;
 936:     const footerHeight = document.getElementById(ID_FOOTER)?.offsetHeight || 0;
 937:     const hasPreview = g(previewCheckAtom);
 938:     const choicesHeight = g(choicesHeightAtom);
 939: 
 940:     // Calculate Main Height (mh) based on UI state
 941:     if (ui === UI.arg) {
 942:       if (!g(choicesReadyAtom)) return;
 943: 
 944:       if (choicesHeight > PROMPT.HEIGHT.BASE) {
 945:         log.info(`🍃 choicesHeight: ${choicesHeight} > PROMPT.HEIGHT.BASE: ${PROMPT.HEIGHT.BASE}`);
 946:         const baseHeight = (promptData?.height && promptData.height > PROMPT.HEIGHT.BASE) ? promptData.height : PROMPT.HEIGHT.BASE;
 947:         mh = baseHeight - topHeight - footerHeight;
 948:       } else {
 949:         log.info(`🍃 choicesHeight: ${choicesHeight} <= PROMPT.HEIGHT.BASE: ${PROMPT.HEIGHT.BASE}`);
 950:         mh = choicesHeight;
 951:       }
 952:     }
 953: 
 954:     if (mh === 0 && hasPanel) {
 955:       mh = Math.max(g(itemHeightAtom), g(mainHeightAtom));
 956:     }
 957: 
 958:     let forceResize = false;
 959:     let ch = 0;
 960: 
 961:     try {
 962:       if (ui === UI.form || ui === UI.fields) {
 963:         ch = (document as any)?.getElementById(UI.form)?.offsetHeight;
 964:         mh = ch;
 965:       } else if (ui === UI.div) {
 966:         ch = (document as any)?.getElementById(ID_PANEL)?.offsetHeight;
 967:         if (ch) {
 968:           mh = promptData?.height || ch;
 969:         } else {
 970:           return;
 971:         }
 972:       } else if (ui === UI.arg && hasPanel) {
 973:         ch = (document as any)?.getElementById(ID_PANEL)?.offsetHeight;
 974:         mh = ch;
 975:         forceResize = true;
 976:       } else if (ui === UI.arg && !hasPanel && !scoredChoicesLength && !document.getElementById(ID_LIST)) {
 977:         ch = 0;
 978:         mh = 0;
 979:         forceResize = true;
 980:       } else if (ui !== UI.arg) {
 981:         ch = (document as any)?.getElementById(ID_MAIN)?.offsetHeight;
 982:       }
 983: 
 984:       if (ui === UI.arg) {
 985:         forceResize = ch === 0 || Boolean(ch < choicesHeight) || hasPanel;
 986:       } else if (ui === UI.div) {
 987:         forceResize = true;
 988:       } else {
 989:         forceResize = Boolean(ch > g(prevMh));
 990:       }
 991:     } catch (error) {
 992:       // Handle potential DOM errors gracefully
 993:     }
 994: 
 995:     if (topHeight !== prevTopHeight) {
 996:       forceResize = true;
 997:       prevTopHeight = topHeight;
 998:     }
 999: 
1000:     const logVisible = g(logHTMLAtom)?.length > 0 && g(scriptAtom)?.log !== false;
1001:     const logHeight = document.getElementById(ID_LOG)?.offsetHeight || 0;
1002: 
1003:     const computeOut = computeResize({
1004:       ui,
1005:       scoredChoicesLength: scoredChoicesLength || 0,
1006:       choicesHeight,
1007:       hasPanel,
1008:       hasPreview,
1009:       promptData: { height: promptData?.height, baseHeight: PROMPT.HEIGHT.BASE },
1010:       topHeight,
1011:       footerHeight,
1012:       isWindow: g(isWindowAtom),
1013:       justOpened: Boolean(g(justOpenedAtom)),
1014:       flaggedValue: g(_flaggedValue),
1015:       mainHeightCurrent: mh,
1016:       itemHeight: g(itemHeightAtom),
1017:       logVisible,
1018:       logHeight,
1019:       gridActive: g(gridReadyAtom),
1020:       prevMainHeight: g(prevMh),
1021:       placeholderOnly,
1022:     });
1023: 
1024:     mh = computeOut.mainHeight;
1025:     let forceHeight = computeOut.forceHeight;
1026: 
1027:     if (ui === UI.debugger) {
1028:       forceHeight = 128;
1029:     }
1030: 
1031:     if (mh === 0 && promptData?.preventCollapse) {
1032:       log.info('🍃 Prevent collapse to zero...');
1033:       return;
1034:     }
1035: 
1036:     log.info(`🍃 mh: ${mh}`, `forceHeight: ${forceHeight}`);
1037: 
1038:     const data: ResizeData = {
1039:       id: promptData?.id || 'missing',
1040:       pid: window.pid || 0,
1041:       reason,
1042:       scriptPath: g(_script)?.filePath,
1043:       placeholderOnly,
1044:       topHeight,
1045:       ui,
1046:       mainHeight: mh + (g(isWindowAtom) ? 24 : 0) + 1,
1047:       footerHeight,
1048:       mode: promptData?.mode || Mode.FILTER,
1049:       hasPanel,
1050:       hasInput: g(inputAtom)?.length > 0,
1051:       previewEnabled: g(previewEnabledAtom),
1052:       open: g(_open),
1053:       tabIndex: g(_tabIndex),
1054:       isSplash: g(isSplashAtom),
1055:       hasPreview,
1056:       inputChanged: g(_inputChangedAtom),
1057:       forceResize,
1058:       forceHeight,
1059:       isWindow: g(isWindowAtom),
1060:       justOpened: g(justOpenedAtom) as any,
1061:       forceWidth: promptData?.width as any,
1062:       totalChoices: scoredChoicesLength as any,
1063:       isMainScript: g(isMainScriptAtom) as any,
1064:     } as ResizeData;
1065: 
1066:     s(prevMh, mh);
1067: 
1068:     debounceSendResize.cancel();
1069:     if (g(justOpenedAtom) && !promptData?.scriptlet) {
1070:       debounceSendResize(data);
1071:     } else {
1072:       sendResize(data);
1073:     }
1074:   },
1075:   RESIZE_DEBOUNCE_MS,
1076:   { leading: true, trailing: true },
1077: );
1078: 
1079: export const triggerResizeAtom = atom(null, (g, s, reason: string) => {
1080:   resize(g, s, `TRIGGER_RESIZE: ${reason}`);
1081: });
1082: 
1083: export const domUpdatedAtom = atom(null, (g, s) => {
1084:   return debounce((reason = '') => {
1085:     resize(g, s, reason);
1086:   }, PREVIEW_THROTTLE_MS);
1087: });
1088: 
1089: // Override mainHeightAtom with complex setter that triggers resize
1090: export const mainHeightAtom = atom(
1091:   (g) => g(_mainHeight),
1092:   (g, s, a: number) => {
1093:     const prevHeight = g(_mainHeight);
1094:     const nextMainHeight = a < 0 ? 0 : a;
1095: 
1096:     // Prevent setting height to 0 if content (panel or choices) exists
1097:     if (nextMainHeight === 0) {
1098:       if (g(panelHTMLAtom) !== '' || g(scoredChoicesAtom).length > 0) {
1099:         return;
1100:       }
1101:     }
1102: 
1103:     s(_mainHeight, nextMainHeight);
1104:     if (a === prevHeight) return;
1105: 
1106:     // Skip resize trigger for specific UIs that manage their own dimensions
1107:     const ui = g(uiAtom);
1108:     if ([UI.drop, UI.editor, UI.textarea].includes(ui)) return;
1109: 
1110:     resize(g, s, 'MAIN_HEIGHT');
1111:   },
1112: );
1113: 
1114: // --- Channel Communication ---
1115: export const channelAtom = atom((g) => {
1116:   if (g(pauseChannelAtom)) {
1117:     return () => { };
1118:   }
1119: 
1120:   return (channel: Channel, override?: any) => {
1121:     const state = g(appStateAtom);
1122:     const pid = g(pidAtom);
1123:     const promptId = g(promptDataAtom)?.id as string;
1124: 
1125:     const appMessage: AppMessage = {
1126:       channel,
1127:       pid: pid || 0,
1128:       promptId: promptId,
1129:       state: {
1130:         ...state,
1131:         ...override,
1132:       },
1133:     };
1134: 
1135:     ipcRenderer.send(channel, appMessage);
1136:   };
1137: });
1138: 
1139: // --- App State Aggregation ---
1140: export const appStateAtom = atom<AppState>((g: Getter) => {
1141:   const state = {
1142:     input: g(_inputAtom),
1143:     actionsInput: g(_actionsInputAtom),
1144:     inputChanged: g(_inputChangedAtom),
1145:     flag: g(focusedFlagValueAtom),
1146:     index: g(indexAtom),
1147:     flaggedValue: g(_flaggedValue) || '',
1148:     focused: g(_focused),
1149:     tab: g(tabsAtom)?.[g(_tabIndex)] || '',
1150:     modifiers: g(_modifiers),
1151:     count: g(choicesAtom).length || 0,
1152:     name: g(nameAtom),
1153:     description: g(descriptionAtom),
1154:     script: g(_script),
1155:     value: g(_submitValue),
1156:     submitted: g(submittedAtom),
1157:     cursor: g(editorCursorPosAtom),
1158:     ui: g(uiAtom),
1159:     tabIndex: g(tabIndexAtom),
1160:     preview: g(previewHTMLAtom),
1161:     keyword: '',
1162:     mode: g(modeAtom),
1163:     multiple: g(promptDataAtom)?.multiple,
1164:     selected: g(selectedChoicesAtom).map((c) => c?.value),
1165:     action: g(focusedActionAtom),
1166:   } as AppState;
1167: 
1168:   return state;
1169: });
1170: 
1171: // --- Submit Value ---
1172: const checkSubmitFormat = (g: Getter, checkValue: unknown): unknown => {
1173:   if (checkValue instanceof ArrayBuffer) {
1174:     return checkValue;
1175:   }
1176:   if (Array.isArray(checkValue)) {
1177:     if (g(choiceInputsAtom).length > 0) {
1178:       return checkValue;
1179:     }
1180: 
1181:     const files = checkValue.map((file) => {
1182:       const fileObject: Record<string, unknown> = {};
1183:       for (const key in file) {
1184:         if (typeof file[key] !== 'function') {
1185:           fileObject[key] = file[key];
1186:         }
1187:       }
1188:       return fileObject;
1189:     });
1190:     return files;
1191:   }
1192:   return checkValue;
1193: };
1194: 
1195: export const enterButtonNameAtom = atom<string>((g) => {
1196:   if (g(uiAtom) === UI.splash) return '';
1197:   const focusedChoice = g(focusedChoiceAtom);
1198:   // Use the choice-specific 'enter' label or the global one
1199:   return focusedChoice?.enter || g(enterAtom);
1200: });
1201: 
1202: export const enterButtonDisabledAtom = atom<boolean>((g) => {
1203:   if (g(uiAtom) === UI.splash || g(submittedAtom)) return true;
1204:   if (g(flaggedChoiceValueAtom)) return false; // Usually enabled when actions menu is open
1205:   if (g(disableSubmitAtom)) return true;
1206:   const enterButtonName = g(enterButtonNameAtom);
1207:   if (enterButtonName === '') return true;
1208: 
1209:   const ui = g(uiAtom);
1210:   if ([UI.fields, UI.form, UI.div].includes(ui)) return false;
1211: 
1212:   const focusedChoice = g(focusedChoiceAtom);
1213:   if (focusedChoice?.disableSubmit) return true;
1214: 
1215:   if (g(panelHTMLAtom)?.length > 0) return false;
1216: 
1217:   const pd = g(promptDataAtom);
1218:   if (!pd?.strict) return false;
1219: 
1220:   // If strict mode is on, disable if no choice is focused
1221:   return focusedChoice?.name === noChoice.name;
1222: });
1223: 
1224: export const shortcutStringsAtom = atom((g) => {
1225:   const shortcuts = g(shortcutsAtom);
1226:   const actions = g(actionsAtom);
1227:   const flags = g(flagsAtom);
1228: 
1229:   // Filter out actions that are already defined as shortcuts to avoid duplication
1230:   const actionsThatArentShortcuts = actions.filter((a: any) => !shortcuts.find((s) => s.key === a.key));
1231: 
1232:   const shortcutKeys = dataUtils.transformKeys(shortcuts, 'key', 'shortcut');
1233:   const actionKeys = dataUtils.transformKeys(actionsThatArentShortcuts as any[], 'key', 'action');
1234:   const flagKeys = dataUtils.transformKeys(Object.values(flags) as any[], 'shortcut', 'flag');
1235: 
1236:   return new Set([...shortcutKeys, ...actionKeys, ...flagKeys]);
1237: });
1238: 
1239: // Moved to state/atoms/actions-utils.ts:
1240: // - sendShortcutAtom
1241: // - sendActionAtom
1242: 
1243: export const submitValueAtom = atom(
1244:   (g) => g(_submitValue),
1245:   (g, s, a: any) => {
1246:     const ui = g(uiAtom);
1247:     const flaggedValue = g(flaggedChoiceValueAtom);
1248:     const flag = g(focusedFlagValueAtom);
1249:     const action = g(focusedActionAtom);
1250:     const enter = g(enterAtom);
1251: 
1252:     const allowEmptyEnterUIs = [UI.term, UI.drop, UI.hotkey];
1253:     const isInAllowedEmptyUI = allowEmptyEnterUIs.includes(ui);
1254: 
1255:     if (enter === '' && !isInAllowedEmptyUI && !flaggedValue && !action) {
1256:       log.warn('👀 Preventing submit because enterAtom is empty');
1257:       return;
1258:     }
1259: 
1260:     if (!(flaggedValue || flag) && a?.scriptlet && a?.inputs?.length > 0) {
1261:       log.info('Scriptlet requires inputs', a.inputs);
1262:       return;
1263:     }
1264: 
1265:     const preventSubmitWithoutAction = g(preventSubmitWithoutActionAtom);
1266:     if (preventSubmitWithoutAction) {
1267:       log.info('👀 preventSubmitWithoutActionAtom');
1268:       return;
1269:     }
1270: 
1271:     const channel = g(channelAtom);
1272: 
1273:     if ((action as FlagsWithKeys).hasAction) {
1274:       channel(Channel.ACTION);
1275:       if (action?.close && g(flaggedChoiceValueAtom)) {
1276:         log.info('👋 Closing actions');
1277:         s(flaggedChoiceValueAtom, '');
1278:       }
1279:       return;
1280:     }
1281: 
1282:     s(onInputSubmitAtom, {});
1283:     s(promptActiveAtom, false);
1284:     s(disableSubmitAtom, false);
1285: 
1286:     if (g(submittedAtom)) return;
1287: 
1288:     const focusedChoice = g(focusedChoiceAtom);
1289: 
1290:     const fid = focusedChoice?.id;
1291:     if (fid) {
1292:       const key = g(promptDataAtom)?.key;
1293:       if (key) {
1294:         try {
1295:           const prevIds = JSON.parse(localStorage.getItem(key) || '[]');
1296:           const index = prevIds.indexOf(fid);
1297:           if (index > -1) {
1298:             prevIds.splice(index, 1);
1299:           }
1300:           prevIds.unshift(fid);
1301:           localStorage.setItem(key, JSON.stringify(prevIds));
1302:         } catch (e) {
1303:           log.error("Failed to update localStorage history", e);
1304:         }
1305:       }
1306:     }
1307: 
1308:     let value = ui === UI.term ? g(termOutputAtom) : checkSubmitFormat(g, a);
1309: 
1310:     const focusedChoiceIsNoChoice = focusedChoice === noChoice;
1311:     const inputIsEmpty = g(inputAtom) === '';
1312:     const choicesAreEmpty = g(choicesAtom).length === 0;
1313:     if (focusedChoiceIsNoChoice && inputIsEmpty && choicesAreEmpty && ui === UI.arg) {
1314:       value = '';
1315:     }
1316: 
1317:     const valueSubmitted = { value, flag };
1318:     channel(Channel.VALUE_SUBMITTED, valueSubmitted);
1319: 
1320:     s(loadingAtom, false);
1321:     if (placeholderTimeoutId) clearTimeout(placeholderTimeoutId);
1322: 
1323:     placeholderTimeoutId = setTimeout(() => {
1324:       s(loadingAtom, true);
1325:       s(processingAtom, true);
1326:     }, PROCESSING_SPINNER_DELAY_MS);
1327: 
1328:     s(submittedAtom, true);
1329:     s(closedInput, g(inputAtom));
1330:     s(_flaggedValue, '');
1331:     s(selectedChoicesAtom, []);
1332:     s(focusedFlagValueAtom, '');
1333:     s(prevIndexAtom, 0);
1334:     s(_submitValue, value);
1335: 
1336:     const stream = g(webcamStreamAtom);
1337:     if (stream && 'getTracks' in stream) {
1338:       (stream as MediaStream).getTracks().forEach((track) => track.stop());
1339:       s(webcamStreamAtom, null);
1340:       const webcamEl = document.getElementById('webcam') as HTMLVideoElement;
1341:       if (webcamEl) {
1342:         webcamEl.srcObject = null;
1343:       }
1344:     }
1345:   },
1346: );
1347: 
1348: export const submitInputAtom = atom(null, (g, s) => {
1349:   const input = g(inputAtom);
1350:   s(submitValueAtom, input);
1351: });
1352: 
1353: export const escapeAtom = atom<any>((g) => {
1354:   const channel = g(channelAtom);
1355:   return () => {
1356:     // Stop any ongoing speech synthesis
1357:     const synth = window.speechSynthesis;
1358:     if (synth.speaking) {
1359:       synth.cancel();
1360:     }
1361: 
1362:     log.info('👋 Sending Channel.ESCAPE');
1363:     channel(Channel.ESCAPE);
1364:   };
1365: });
1366: 
1367: export const blurAtom = atom(null, (g) => {
1368:   if (g(openAtom)) {
1369:     const channel = g(channelAtom);
1370:     channel(Channel.BLUR);
1371:   }
1372: });
1373: 
1374: export const changeAtom = atom((g) => (data: any) => {
1375:   const channel = g(channelAtom);
1376:   channel(Channel.CHANGE, { value: data });
1377: });
1378: 
1379: export const runMainScriptAtom = atom(() => () => {
1380:   ipcRenderer.send(AppChannel.RUN_MAIN_SCRIPT);
1381: });
1382: 
1383: export const toggleSelectedChoiceAtom = atom(null, (g, s, id: string) => {
1384:   const selectedChoices = [...g(selectedChoicesAtom)];
1385:   const scoredChoice = g(choices).find((c) => c?.item?.id === id);
1386:   const index = selectedChoices.findIndex((c) => c?.id === id);
1387: 
1388:   if (index > -1) {
1389:     selectedChoices.splice(index, 1);
1390:   } else if (scoredChoice?.item) {
1391:     selectedChoices.push(scoredChoice.item as Choice);
1392:   }
1393: 
1394:   s(selectedChoicesAtom, selectedChoices);
1395: });
1396: 
1397: export const toggleAllSelectedChoicesAtom = atom(null, (g, s) => {
1398:   const selectedChoices = g(selectedChoicesAtom);
1399:   const cs = g(choices).map((c) => c?.item as Choice);
1400: 
1401:   if (selectedChoices.length === cs.length) {
1402:     s(selectedChoicesAtom, []);
1403:   } else {
1404:     s(selectedChoicesAtom, cs);
1405:   }
1406: });
1407: 
1408: export const getEditorHistoryAtom = atom((g) => () => {
1409:   const channel = g(channelAtom);
1410:   channel(Channel.GET_EDITOR_HISTORY, { editorHistory: g(editorHistory) });
1411: });
1412: 
1413: export const colorAtom = atom((g) => {
1414:   return async () => {
1415:     try {
1416:       // @ts-ignore -- EyeDropper API might not be in standard TS types yet
1417:       const eyeDropper = new EyeDropper();
1418:       const { sRGBHex } = await eyeDropper.open();
1419: 
1420:       const color = colorUtils.convertColor(sRGBHex);
1421:       const channel = Channel.GET_COLOR;
1422:       const pid = g(pidAtom);
1423: 
1424:       const appMessage = {
1425:         channel,
1426:         pid: pid || 0,
1427:         value: color,
1428:       };
1429: 
1430:       ipcRenderer.send(channel, appMessage);
1431:       return color;
1432:     } catch (error) {
1433:       // User cancelled or EyeDropper failed
1434:       return '';
1435:     }
1436:   };
1437: });
1438: 
1439: export const appendInputAtom = atom(null, (g, s, a: string) => {
1440:   const ui = g(uiAtom);
1441:   if (ui === UI.editor) {
1442:     s(editorAppendAtom, a);
1443:   } else {
1444:     const input = g(_inputAtom);
1445:     s(_inputAtom, input + a);
1446:   }
1447: });
1448: 
1449: export const valueInvalidAtom = atom(null, (g, s, a: string) => {
1450:   if (placeholderTimeoutId) clearTimeout(placeholderTimeoutId);
1451: 
1452:   s(processingAtom, false);
1453:   s(inputAtom, '');
1454:   s(_inputChangedAtom, false);
1455: 
1456:   if (typeof a === 'string') {
1457:     // hintAtom setter handles the ANSI conversion
1458:     s(hintAtom, a);
1459:   }
1460: 
1461:   const channel = g(channelAtom);
1462:   channel(Channel.ON_VALIDATION_FAILED);
1463: });
1464: 
1465: export const preventSubmitAtom = atom(null, (_g, s, _a: string) => {
1466:   s(promptActiveAtom, true);
1467:   if (placeholderTimeoutId) clearTimeout(placeholderTimeoutId);
1468:   s(submittedAtom, false);
1469:   s(processingAtom, false);
1470:   s(_inputChangedAtom, false);
1471: });
1472: 
1473: export const triggerKeywordAtom = atom(
1474:   (_g) => { },
1475:   (
1476:     g,
1477:     _s,
1478:     { keyword, choice }: { keyword: string; choice: Choice },
1479:   ) => {
1480:     const channel = g(channelAtom);
1481:     channel(Channel.KEYWORD_TRIGGERED, {
1482:       keyword,
1483:       focused: choice,
1484:       value: choice?.value,
1485:     });
1486:   },
1487: );
1488: 
1489: export const sendShortcutAtom = atom(null, (g, s, shortcut: string) => {
1490:   const channel = g(channelAtom);
1491:   const hasEnterShortcut = g(shortcutsAtom).find((s) => s.key === 'enter');
1492:   log.info('🎬 Send shortcut', { shortcut, hasEnterShortcut });
1493: 
1494:   // If 'enter' is pressed and not defined as a specific shortcut, treat it as a submission trigger (tracked via time)
1495:   if (shortcut === 'enter' && !hasEnterShortcut) {
1496:     s(enterLastPressedAtom, new Date());
1497:   } else {
1498:     // Otherwise, send it as a shortcut event.
1499:     channel(Channel.SHORTCUT, { shortcut });
1500:   }
1501: });
1502: 
1503: export const sendActionAtom = atom(null, (g, _s, action: Action) => {
1504:   const channel = g(channelAtom);
1505:   log.info(`👉 Sending action: ${action.name}`);
1506:   channel(Channel.ACTION, { action });
1507: });
1508: 
1509: // =================================================================================================
1510: // DERIVED ATOMS
1511: // These atoms depend on the wired state and must be defined here.
1512: // =================================================================================================
1513: 
1514: // --- UI State ---
1515: 
1516: export const isMainScriptInitialAtom = atom<boolean>((g) => {
1517:   return g(isMainScriptAtom) && g(inputAtom) === '';
1518: });
1519: 
1520: export const showTabsAtom = atom((g) => {
1521:   const isArg = [UI.arg].includes(g(uiAtom));
1522:   const hasTabs = g(tabsAtom)?.length > 0;
1523:   return isArg && hasTabs;
1524: });
1525: 
1526: export const showSelectedAtom = atom((g) => {
1527:   return [UI.arg, UI.hotkey].includes(g(uiAtom)) && g(selectedAtom) && g(tabsAtom)?.length > 0;
1528: });
1529: 
1530: // --- Actions State ---
1531: 
1532: export const hasActionsAtom = atom((g) => {
1533:   const flags = g(flagsAtom);
1534:   const focusedChoice = g(focusedChoiceAtom);
1535:   // Actions exist if there are global flags or the focused choice has specific actions
1536:   return Object.entries(flags).length > 0 || !!focusedChoice?.actions;
1537: });
1538: 
1539: // Merges flags and shortcuts into a unified list of actions for display
1540: export const actionsAtom = atom((g) => {
1541:   const flags = g(flagsAtom);
1542:   const shortcuts = g(shortcutsAtom);
1543:   const disabled = g(flaggedChoiceValueAtom); // Disabled if the actions menu is already open
1544: 
1545:   const flagActions = Object.entries(flags).map(([key, flag]) => {
1546:     const f = flag as any;
1547:     return {
1548:       key: f?.key || f?.shortcut,
1549:       value: key,
1550:       name: f?.name,
1551:       shortcut: formatShortcut(f?.shortcut),
1552:       position: f?.bar,
1553:       arrow: f?.arrow,
1554:       flag: key,
1555:       disabled: Boolean(disabled),
1556:       visible: Boolean(f?.visible),
1557:     } as Action;
1558:   });
1559: 
1560:   const shortcutActions = shortcuts
1561:     .filter((s) => s?.bar)
1562:     .map(({ key, name, bar, flag, visible }) => ({
1563:       key,
1564:       name,
1565:       value: key,
1566:       shortcut: formatShortcut(key),
1567:       position: bar,
1568:       flag,
1569:       disabled: Boolean(disabled),
1570:       visible: Boolean(visible),
1571:     } as Action));
1572: 
1573:   return flagActions.concat(shortcutActions);
1574: });
1575: 
1576: export const preventSubmitWithoutActionAtom = atom((g) => {
1577:   const flaggedValue = g(flaggedChoiceValueAtom);
1578:   const focusedAction = g(focusedActionAtom);
1579:   // Submit should be prevented when actions menu is open without a selected action
1580:   return flaggedValue && Object.keys(focusedAction).length === 0;
1581: });
1582: 
1583: export const actionsPlaceholderAtom = atom((g) => {
1584:   const hasActions = g(hasActionsAtom);
1585:   return hasActions ? 'Actions' : 'No Actions Available';
1586: });
1587: 
1588: // --- Utility Actions ---
1589: 
1590: export const listProcessesActionAtom = atom((g) => {
1591:   const shortcuts = g(shortcutsAtom);
1592:   return shortcuts.find((s) => s?.key?.endsWith('p'));
1593: });
1594: 
1595: export const signInActionAtom = atom((g) => {
1596:   const actions = g(actionsAtom);
1597:   return actions.find((s) => s?.flag === 'sign-in-to-script-kit');
1598: });
1599: 
1600: export const actionsButtonActionAtom = atom<Action>((g) => {
1601:   const isMac = g(appConfigAtom).isMac;
1602: 
1603:   return {
1604:     name: 'Actions',
1605:     value: isMac ? 'cmd+k' : 'ctrl+k',
1606:     shortcut: isMac ? '⌘+K' : '⌃+K',
1607:     position: 'right',
1608:     disabled: false,
1609:   } as Action;
1610: });
1611: 
1612: export const shouldActionButtonShowOnInputAtom = atom((g) => {
1613:   const hasFlags = Object.keys(g(flagsAtom)).length > 0;
1614:   const hasRightShortcut = g(hasRightShortcutAtom);
1615:   return hasFlags && !hasRightShortcut;
1616: });
1617: 
1618: // --- Missing atoms that are referenced but not defined ---
1619: export const initPromptAtom = atom(null, (g, s) => {
1620:   log.info(`${window.pid}: 🚀 Init prompt`);
1621:   const currentPromptData = g(promptDataAtom);
1622:   if (currentPromptData?.id) {
1623:     log.info(`🚪 Init prompt skipped. Already initialized as ${currentPromptData?.id}`);
1624:     return;
1625:   }
1626:   // Restore state from cache atomically to prevent flicker
1627:   const promptData = g(cachedMainPromptDataAtom) as PromptData;
1628:   const scoredChoices = g(cachedMainScoredChoicesAtom);
1629:   s(promptDataAtom, promptData);
1630:   s(scoredChoicesAtom, scoredChoices);
1631:   s(previewHTMLAtom, g(cachedMainPreviewAtom));
1632:   s(shortcutsAtom, g(cachedMainShortcutsAtom));
1633:   s(flagsAtom, g(cachedMainFlagsAtom));
1634: });
1635: 
1636: const promptBoundsDefault = {
1637:   id: '',
1638:   width: 0,
1639:   height: 0,
1640:   x: 0,
1641:   y: 0,
1642: };
1643: 
1644: export const clearCacheAtom = atom(null, (_g, s) => {
1645:   s(cachedMainPromptDataAtom, {});
1646:   s(cachedMainScoredChoicesAtom, []);
1647:   s(cachedMainPreviewAtom, '');
1648:   s(cachedMainShortcutsAtom, []);
1649:   s(cachedMainFlagsAtom, {});
1650:   s(promptDataAtom, {} as PromptData);
1651:   s(scoredChoicesAtom, []);
1652:   s(promptBoundsAtom, promptBoundsDefault);
1653: });
1654: 
1655: const _topHeight = atom(88);
1656: export const topHeightAtom = atom(
1657:   (g) => g(_topHeight),
1658:   (g, s) => {
1659:     const resizeComplete = g(resizeCompleteAtom);
1660:     if (!resizeComplete) return;
1661:     resize(g, s, 'TOP_HEIGHT');
1662:   },
1663: );
1664: 
1665: export const onPasteAtom = atom((g) => (event: ClipboardEvent) => {
1666:   if (g(uiAtom) === UI.editor) {
1667:     event.preventDefault(); // Assuming we want to handle paste manually or let Monaco handle it
1668:   }
1669:   const channel = g(channelAtom);
1670:   channel(Channel.ON_PASTE);
1671: });
1672: 
1673: export const onDropAtom = atom((g) => (event: DragEvent) => {
1674:   if (g(uiAtom) === UI.drop) return; // UI.drop likely has its own specific handler
1675:   event.preventDefault();
1676:   let drop = '';
1677:   const files = Array.from(event?.dataTransfer?.files || []);
1678:   if (files.length > 0) {
1679:     drop = files
1680:       .map((file: File) => (file as any).path)
1681:       .join('\n')
1682:       .trim();
1683:   } else {
1684:     drop = event?.dataTransfer?.getData('URL') || event?.dataTransfer?.getData('Text') || '';
1685:   }
1686:   const channel = g(channelAtom);
1687:   channel(Channel.ON_DROP, { drop });
1688: });
1689: 
1690: // Export remaining helper functions and constants for compatibility
1691: export { placeholderTimeoutId };
```
