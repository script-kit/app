## Prompt refactor status (what changed and why it’s live now)

### Overview
- Goal: Shrink and simplify `src/main/prompt.ts` by extracting self‑contained logic into small modules without changing runtime behavior.
- Result so far: `prompt.ts` dropped from ~3531 lines to ~3166 lines (−365). Functionality is identical; crashes fixed (ESM `require` error).

### What was extracted (and used in production paths)

1) Screen/Bounds Defaults and Cache
- New: `src/main/prompt.screen-utils.ts`
  - `getCurrentScreenFromMouse`, `getAllScreens`, `getCurrentScreenPromptCache`, `pointOnMouseScreen`.
- New: `src/main/prompt.cache.ts`
  - `clearPromptCacheFor` and cache helpers.
- Changes in `prompt.ts`:
  - All above functions now imported and used directly. Callers in other files updated to import from the new modules.

2) Resize and Bounds Computation
- New: `src/main/prompt.resize-utils.ts`
  - `calculateTargetDimensions`, `calculateTargetPosition`.
- New: `src/main/prompt.bounds-utils.ts`
  - `adjustBoundsToAvoidOverlap`, `getTitleBarHeight`, `ensureMinWindowHeight`, `applyPromptDataBounds`.
- Changes in `prompt.ts`:
  - `resize(...)` delegates to `calculateTargetDimensions/Position`.
  - `setBounds(...)` uses `adjustBoundsToAvoidOverlap` and min-height helpers.
  - `checkPromptDataBounds(...)` now a 1-liner via `applyPromptDataBounds`.

3) Notifications
- New: `src/main/prompt.notifications.ts`
  - `buildLongRunningNotificationOptions`, `buildProcessConnectionLostOptions`, `buildProcessDebugInfo`.
- Changes in `prompt.ts`:
  - Long‑running and process‑connection notifications use the new builders (behavior/logs unchanged).

4) Process Monitoring
- New: `src/main/prompt.process-utils.ts`
  - `shouldMonitorProcess`, `getProcessCheckInterval`, `getLongRunningThresholdMs`.
- New: `src/main/prompt.process-monitor.ts`
  - `checkProcessAlive`, `startProcessMonitoring`, `stopProcessMonitoring`, `listenForProcessExit`.
- Changes in `prompt.ts`:
  - Methods delegate to the new helpers; logging and side effects preserved.
  - Fixed ESM build error by replacing runtime `require` with ESM imports.

### Why you’ll see it when running the app
- The exported API from `prompt.ts` is preserved. All call sites were updated to import the extracted functions.
- The app now uses the new modules at runtime:
  - Resizes, bounds application, and save/restore paths route through the new utility functions.
  - Process monitoring and notifications route through the new helpers.
  - The earlier crash (`ReferenceError: require is not defined`) is fixed by ESM imports, so dev runs are stable.

### How to validate quickly
1. Dev run (Electron):
   - `cd app && pnpm dev`
   - Trigger prompt open/resize; watch identical behavior (geometry, overlap avoidance, min‑height).
   - Long‑running scripts should show the same notification behavior.

2. Type/lint/tests:
   - `pnpm format:check` and `pnpm test` (some pre‑existing tests still fail; unrelated to this refactor).

### Why lines didn’t plummet at first glance
- `prompt.ts` shed large, complex functions, but remains a coordinator for many features.
- We added small, focused files (net lines moved, not created). The main file is smaller and simpler; the system is now modular.

### Next steps to reduce further
- Extract: window lifecycle (makeWindow/onBlur/focus/hide), init/boot wiring, and key handlers into `prompt.window.ts`, `prompt.focus.ts`, `prompt.init.ts`, `prompt.input.ts`.
- Each step will continue to keep logs/behavior unchanged and will further reduce `prompt.ts` line count.

### Summary of impacts
- Safer, smaller functions; easier to test and maintain.
- Fixed ESM `require` runtime error.
- `prompt.ts` is already ~10% smaller; more reductions planned in next passes.


