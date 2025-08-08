./src/renderer/src/jotai.ts

Got it. Here’s a **safe, incremental, “no‑surprises” refactor plan** you can hand to a junior dev. It’s broken into tiny steps, each with a clear goal, commands to run, a checklist to verify, and suggested commit messages. The guiding principle: **no behavior changes first**, then **deduplicate and extract**, then **split files**.

---

## Ground rules (print these at the top of the task)

* **Never change public exports** during steps 1–7. Add new helpers/aliases; remove later.
* **One mechanical change per commit.** Run the checklist, then commit.
* **If any checklist fails, revert immediately** (don’t stack fixes).
* Prefer **copy/paste extraction** to clever rewrites for the first pass.

---

## Step 0 — Baseline & Safety Net (30–45 min)

**Goal:** Freeze a working baseline and ensure quick feedback loops.

1. Create a working branch:

```bash
git checkout -b refactor/jotai-state-split
```

2. Make sure TypeScript and the app build work:

```bash
pnpm tsc --noEmit
pnpm dev   # or your run command
```

3. Add a **fast sanity script** you can run after every step:

```json
// package.json
"scripts": {
  "state:quickcheck": "pnpm tsc --noEmit && echo '✅ typecheck ok'"
}
```

4. Optional (recommended): Set test runner to **jsdom** so atoms touching `document` won’t crash when tested later.

**Checklist**

* `pnpm state:quickcheck` passes.
* App opens, basic flows work: open prompt, type, open/close actions, run main script, close.

**Commit**

> chore: prepare baseline & quickcheck script

---

## Step 1 — Add “Refactor Markers” (mechanical comments) (15–20 min)

**Goal:** Mark the code where we’ll extract or deduplicate later—**no logic change**.

* At the top of each big section (they’re already labeled `// FILE: ...`), add:

```ts
// REFACTOR_TARGET: keep public exports stable; internal logic will be extracted in later steps.
```

* Above the big `openAtom` close-branch (where many resets happen), add:

```ts
// REFACTOR_TARGET(reset): consolidate to resetPromptState() helper (no behavior change)
```

* Above both “skipped items navigation” blocks (in `indexAtom` and `flagsIndexAtom`):

```ts
// REFACTOR_TARGET(skip-nav): extract to shared advanceIndexSkipping()
```

* Above `resize`:

```ts
// REFACTOR_TARGET(resize): extract DOM-free compute + thin DOM wrapper
```

**Checklist**

* App still runs; no code changed besides comments.

**Commit**

> docs: add refactor markers for planned extractions

---

## Step 2 — Centralize “Magic Numbers/Delays” (mechanical) (20–30 min)

**Goal:** Replace repeated raw numbers (`25`, `50`, `100`, `250`, `500`, `1920`, etc.) with named constants in **one constants file**. Zero behavior change.

1. Create `src/state/constants.ts`:

```ts
export const SCROLL_THROTTLE_MS = 25;
export const PREVIEW_THROTTLE_MS = 25;
export const RESIZE_DEBOUNCE_MS = 50;
export const SEND_RESIZE_DEBOUNCE_MS = 100;
export const JUST_OPENED_MS = 250;
export const PROCESSING_SPINNER_DELAY_MS = 500;
export const MAX_VLIST_HEIGHT = 1920;
export const MAX_LOG_LINES = 256;
export const MAX_EDITOR_HISTORY = 30;
export const MAX_TABCHECK_ATTEMPTS = 60;
```

2. Import and use these constants where numbers appear (one search/replace at a time).

**Checklist**

* Typecheck OK.
* You can still open/close prompts; scrolling and preview timing feel unchanged.

**Commit**

> refactor(state): centralize magic numbers into constants (no behavior change)

---

## Step 3 — Extract “Reset on Close” into a helper (no logic change) (45–60 min)

**Goal:** The close branch in `openAtom` resets \~20 atoms. Extract to a **local helper** to remove duplication and reduce cognitive load.

1. Create `src/state/reset.ts`:

```ts
import { atom } from 'jotai';
// import all atoms referenced by the current close branch

export function resetPromptState(g: any, s: any) {
  // Copy EXACTLY the same `s(...)` calls from the close branch
  // Keep order and values identical
  // Do not change the logic
}
```

2. In `openAtom` close path, replace the big block with:

```ts
if (g(_open) && a === false) {
  resetPromptState(g, s);
}
```

**Checklist**

* Typecheck OK.
* Manual QA: open a script, close it. Confirm:

  * preview cleared
  * flags cleared
  * pid set to 0
  * logs reset
  * webcam stream stopped
  * ui returns to pre-close state (as before)

**Commit**

> refactor(state): extract resetPromptState helper (no behavior change)

---

## Step 4 — Extract “Skip Navigation” into a shared helper (no logic change) (45–60 min)

**Goal:** Deduplicate the “skip items” loop shared by `indexAtom` and `flagsIndexAtom`.

1. Create `src/state/skip-nav.ts`:

```ts
export function advanceIndexSkipping(
  startIndex: number,
  direction: 1 | -1,
  items: Array<{ item?: { skip?: boolean } }>
): number {
  let i = startIndex;
  let loopCount = 0;
  const len = items.length;

  if (len === 0) return 0;

  let choice = items[i]?.item;

  while (choice?.skip && loopCount < len) {
    i = (i + direction + len) % len;
    choice = items[i]?.item;
    loopCount++;
  }

  return i;
}
```

2. Replace each inline “skip” while-loop with this helper:

```ts
calcIndex = advanceIndexSkipping(clampedIndex, direction, cs);
```

3. Keep the **safety** checks that existed around it (like `allSkipAtom` cases).

**Checklist**

* Typecheck OK.
* Manual QA: with a list containing group headers or skipped items, ensure arrow navigation lands on actionable items exactly as before.

**Commit**

> refactor(state): extract shared skip navigation helper (no behavior change)

---

## Step 5 — Extract “Resize” into compute + wrapper (no behavior change) (90–120 min)

**Goal:** Make `resize` understandable by splitting **DOM-free computation** out of the side‑effectful code.

1. Create `src/state/resize/compute.ts`:

```ts
import { Mode, UI, PROMPT } from '@johnlindquist/kit/core/enum';

export type ComputeResizeInput = {
  ui: UI;
  scoredChoicesLength: number;
  choicesHeight: number;
  hasPanel: boolean;
  hasPreview: boolean;
  promptData: any; // keep as any to avoid ripple effects
  topHeight: number;
  footerHeight: number;
  isWindow: boolean;
  justOpened: boolean;
  flaggedValue: any;
  mainHeightCurrent: number;
  itemHeight: number;
  logVisible: boolean;
  logHeight: number;
  gridActive: boolean;
  prevMainHeight: number;
  placeholderOnly: boolean;
};

export type ComputeResizeOutput = {
  mainHeight: number;
  forceHeight?: number;
  forceResize: boolean;
};

export function computeResize(i: ComputeResizeInput): ComputeResizeOutput {
  // Copy the pure calc parts from resize, using the same conditions,
  // but do NOT touch document.* or ipcRenderer here.
  // Return the derived values used to build ResizeData.
}
```

2. Create `src/state/resize/index.ts` to keep the original exported `resize` function name. Inside, call `computeResize()` and **keep all DOM reads and ipcRenderer calls here**.

3. In the original file, replace the `resize` body with calls to the new function, keeping the function name/export identical.

**Checklist**

* Typecheck OK.
* App opens; resizing still behaves the same (list grows/shrinks, panels, preview on/off, actions open).

**Commit**

> refactor(state): split resize into compute + dom wrapper (no behavior change)

---

## Step 6 — Extract small utilities (mechanical) (45–60 min)

**Goal:** Pull out tiny repeated utilities to self‑document intent.

* Create `src/state/timers.ts`:

  * `debounceSendResize = debounce(sendResize, SEND_RESIZE_DEBOUNCE_MS)`
  * Any repeated throttles/debounces that aren’t section‑specific.

* Create `src/state/dom-ids.ts` with **shared element IDs** used by `getElementById` calls:

```ts
export const ID_HEADER = 'header';
export const ID_FOOTER = 'footer';
export const ID_MAIN = 'main';
export const ID_LIST = 'list';
export const ID_PANEL = 'panel';
export const ID_PREVIEW = 'preview';
export const ID_WEBCAM = 'webcam';
```

Replace string literals with these constants (search/replace one by one).

**Checklist**

* Typecheck OK.
* App works the same. No visual changes.

**Commit**

> refactor(state): extract small utilities (ids/timers) to reduce magic strings

---

## Step 7 — Tighten types where they’re already obvious (no behavior change) (60–90 min)

**Goal:** Add types only where it’s **zero risk** (already implied by usage).

Examples you can apply safely:

* Narrow atoms that always hold numbers/booleans/strings:

  * `const _open = atom(false);` ➜ already typed; OK.
  * For any `atom<any>` that’s truly a union you know (`Choice | ''`), define a **named type alias** and use it, but **do not** change function signatures exported outside.

* Convert repeated inline object shapes to **exported types** (e.g., `TermConfig` is already typed; follow this pattern for any local shapes you see repeated).

**Checklist**

* Typecheck OK.
* No changes to runtime behavior.

**Commit**

> refactor(types): add obvious/narrow types and aliases (no behavior change)

---

## Step 8 — Introduce a single “barrel” re-export (compatibility shim) (30–45 min)

**Goal:** Prepare for physical file split while keeping import paths stable.

1. Create `src/state/index.ts` and **re-export every atom/function** that the app imports today (import from their current file and re-export).

2. In the rest of the app (outside this state file), **do not** change import paths yet.

This is a no-op for runtime; it gives you a single place to preserve API stability later.

**Checklist**

* Typecheck OK.
* App runs as before.

**Commit**

> chore(state): add barrel index to preserve API during future splits

---

## Step 9 — Physically split the file along the existing section markers (90–120 min)

**Goal:** Move code into real files that match the current section headers. **No symbol renames.**

Suggested structure (matches your comment headers):

```
src/state/
  app-core.ts
  script-state.ts
  prompt-data.ts
  input-state.ts
  choices-state.ts
  actions-state.ts
  ui-layout.ts
  preview-state.ts
  components/
    editor-state.ts
    terminal-state.ts
    chat-state.ts
    media-state.ts
    other-components.ts
  log-state.ts
  ipc.ts
  utils.ts
  reset.ts
  skip-nav.ts
  resize/
    compute.ts
    index.ts
  constants.ts
  dom-ids.ts
  timers.ts
  index.ts        // barrel: re-export everything
```

**Process:**

* Move one section at a time.
* After each move: `pnpm state:quickcheck` and manual smoke test.
* Update **only internal relative imports** between these files.
* Keep the original import paths that external code uses by re-exporting from `src/state/index.ts`.

**Checklist (after the last move)**

* Typecheck OK.
* App flows still work.

**Commit**

> refactor(state): split monolith into domain files (no behavior change)

---

## Step 10 — Deduplicate small patterns (behavior unchanged) (60–90 min)

**Targets:**

* **“Remove top border on first item”** logic appears twice (choices & flags). Extract:

  ```ts
  export function removeTopBorderOnFirstItem(list: ScoredChoice[]) {
    const first = list?.[0]?.item;
    if (first?.className) first.className = first.className.replace('border-t-1', '');
  }
  ```

  Call it from both places.

* **“Calculate list height with cap”** appears twice. Extract:

  ```ts
  export function calcVirtualListHeight(list: ScoredChoice[], defaultItemHeight: number, cap = MAX_VLIST_HEIGHT) {
    let h = 0;
    for (const { item: { height } } of list) {
      h += height || defaultItemHeight;
      if (h > cap) return cap;
    }
    return h;
  }
  ```

* Replace both usages, keep inputs/outputs identical.

**Checklist**

* Typecheck OK.
* Scrolling/height behavior unchanged.

**Commit**

> refactor(state): deduplicate border-trim and height-calc helpers (no behavior change)

---

## Step 11 — Introduce “state reset pack” for tests & manual use (nice-to-have) (30–45 min)

**Goal:** Provide one exported function to reset everything—already implemented as `resetPromptState`. Now **export** a wrapper for tests and diagnostics:

```ts
// src/state/testing.ts
import { resetPromptState } from './reset';
export function resetAllState(g: any, s: any) {
  resetPromptState(g, s);
}
```

No app code changes. This is future-proofing.

**Checklist**

* Typecheck OK.

**Commit**

> chore(test): export resetAllState for future tests

---

## Step 12 — Document invariants & add comments where logic is tricky (30–60 min)

**Goal:** Make the code obvious to the next reader.

* Add 1–2 line “why” comments above:

  * `flaggedChoiceValueAtom` behavior (open/close menu restores indices).
  * `preventSubmitWithoutActionAtom` guard.
  * `promptReadyAtom` toggling around preloads.
  * Any place using `localStorage` history (what we store & why).

**Checklist**

* Typecheck OK.

**Commit**

> docs(state): add why-comments for tricky atoms and flows

---

# Optional (post‑refactor) improvements

> Only tackle these **after** the app ships with the above refactor and you’re confident in stability.

1. **Runtime guards** around DOM access:

   ```ts
   const header = typeof document !== 'undefined' ? document.getElementById(ID_HEADER) : null;
   ```
2. **Stronger types** for mixed unions (e.g., `Choice | string`): introduce `type MaybeChoice = Choice | ''`.
3. **Deprecate** permanently-disabled features (e.g., `miniShortcutsVisibleAtom` returning false) with `/** @deprecated kept for compatibility */` and plan a removal window.

---

## Quick QA script for junior devs (repeat after each step)

* Open app, run the main script.
* Type into the prompt; ensure index resets on clear.
* Arrow-up/down across a list with group headers—focus lands on actionable items.
* Open actions (Cmd/Ctrl+K); type to filter; close actions; previous index restores.
* Toggle preview on/off via focusing choices.
* Open a script with terminal/editor UI; ensure resize doesn’t jitter.
* Close the window; reopen—state is clean; no webcam/mic lingering.

---

## Suggested commit log (copy/paste)

1. `chore: prepare baseline & quickcheck script`
2. `docs: add refactor markers for planned extractions`
3. `refactor(state): centralize magic numbers into constants (no behavior change)`
4. `refactor(state): extract resetPromptState helper (no behavior change)`
5. `refactor(state): extract shared skip navigation helper (no behavior change)`
6. `refactor(state): split resize into compute + dom wrapper (no behavior change)`
7. `refactor(state): extract small utilities (ids/timers) to reduce magic strings`
8. `refactor(types): add obvious/narrow types and aliases (no behavior change)`
9. `chore(state): add barrel index to preserve API during future splits`
10. `refactor(state): split monolith into domain files (no behavior change)`
11. `refactor(state): deduplicate border-trim and height-calc helpers (no behavior change)`
12. `chore(test): export resetAllState for future tests`
13. `docs(state): add why-comments for tricky atoms and flows`

---

## Appendix: tiny snippets you can copy

**Search commands (ripgrep)**

```bash
rg "border-t-1"
rg "offsetHeight"
rg "setTimeout"
rg "while .*skip" -n
rg "1920|250|500|25|50|100|60" -n
```

**Helper: remove first item top border**

```ts
export function removeTopBorderOnFirstItem(list: ScoredChoice[]) {
  const first = list?.[0]?.item;
  if (first?.className) first.className = first.className.replace('border-t-1', '');
}
```

**Helper: cap virtual list height**

```ts
export function calcVirtualListHeight(
  list: ScoredChoice[],
  defaultItemHeight: number,
  cap = MAX_VLIST_HEIGHT
) {
  let h = 0;
  for (const { item: { height } } of list) {
    h += height || defaultItemHeight;
    if (h > cap) return cap;
  }
  return h;
}
```

---

If you want, I can generate the initial `constants.ts`, `reset.ts`, `skip-nav.ts`, and `resize/compute.ts` scaffolds exactly as they should look in your repo so you can paste them in.

