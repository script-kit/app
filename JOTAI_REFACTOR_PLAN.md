# Jotai State Refactoring Plan

## North Stars
* **Single source of truth per concern** - No duplicate atoms or logic
* **Pure vs. side-effectful clearly separated** - Pure selectors/compute in `derived/` or `lib/`; IO/DOM/IPC in `controllers/` or `services/`
* **Feature-first layout** - Everything for a feature sits together
* **Predictable atom patterns** - Consistent naming and placement
* **Progressive hardening** - Each refactor raises type safety without changing behavior

## Target Architecture

```
src/renderer/state/
  features/
    app/
      atoms.ts        # Private base atoms + public RW atoms
      derived.ts      # Pure derived atoms/selectors
      controller.tsx  # React subscribers with side effects
      services.ts     # IPC/HTTP/FS wrappers
      types.ts        # Local types
      README.md       # Feature documentation
      __tests__/      # Feature tests
    prompt/
    choices/
    actions/
    input/
    chat/
    media/
    terminal/
    resize/
    theme/
    log/
    ipc/
  lib/
    computeResize.ts         # Pure computation
    focus/computeDecision.ts # Pure focus logic
    skipNav.ts               # Pure navigation
    dom.ts                   # DOM helpers
    types.ts                 # Shared types
  core/
    store.ts                 # Jotai store helpers
    conventions.md           # Architecture conventions
  index.ts                   # Public API barrel export
```

## PR Sequence

### PR 1: Baseline + Safety Nets ✅
**Goal:** Lock current behavior, add guardrails

**Tasks:**
- [ ] Add scripts: `pnpm typecheck`, `pnpm lint`, `pnpm test`
- [ ] Enable TS strict mode
- [ ] Configure ESLint with key rules
- [ ] Create smoke tests for pure functions
- [ ] Document conventions in `state/core/conventions.md`

### PR 2: Kill Duplicate Atoms
**Goal:** Single source of truth

**Duplicates to resolve:**
- `isMainScriptAtom` (in shared-atoms.ts, atoms/script-state.ts, state/script-state.ts)
- `openAtom` (in app-lifecycle.ts, jotai.ts)
- `promptDataAtom` (multiple locations)
- `inputAtom` (multiple locations)
- `termConfigAtom` (multiple locations)
- `logHTMLAtom` (multiple locations)

**Action:** Keep one canonical version, re-export from barrel

### PR 3: Extract Complex Wiring from jotai.ts
**Goal:** Make jotai.ts thin (<400 lines)

**Move:**
- `resize()` function → `features/resize/controller.tsx`
- Throttled focus logic → `features/choices/controller.tsx`
- Remove module-level mutable variables
- Keep only atom exports and composed selectors

### PR 4: Formalize Controller Pattern
**Goal:** All side effects in controllers

**Pattern:**
```tsx
// features/input/controller.tsx
export function InputController() {
  const value = useAtomValue(inputValueAtom);  // read-only
  const send = useChannel();                   // side effect
  useEffect(() => { 
    send(Channel.INPUT, { value }); 
  }, [value, send]);
  return null;
}
```

### PR 5: Atom Naming Conventions
**Goal:** Predictable naming

**Conventions:**
- Private base: `_inputAtom`
- Public RW: `inputAtom`
- Derived: `inputValueSelector`
- Actions: `appendInputAtom`, `setFlagsIndexAtom`
- Booleans: `isFooAtom`, `hasBarAtom`

### PR 6: Side-Effect Boundaries
**Goal:** Pure atoms, effectful controllers

**Remove from atoms:**
- `document.getElementById`
- `ipcRenderer.send`
- `setTimeout`

### PR 7: Type Safety
**Goal:** Eliminate `any`, proper types

**Fix:**
- Type `micMediaRecorderAtom`
- Type `termConfig`
- Type `AppMessage` payloads
- Narrowed Channel types

### PR 8: Comprehensive Tests
**Goal:** 80% coverage for pure logic

**Test:**
- `computeResize` (table-driven)
- `computeFocusDecision` (scenarios)
- `skipNav` (edge cases)
- Controllers (RTL integration)

### PR 9: Performance Optimization
**Goal:** Eliminate unnecessary re-renders

**Add:**
- Re-render tracer
- Memoized selectors
- Virtual list optimizations
- Benchmarks

### PR 10: Contributor Experience
**Goal:** Easy onboarding

**Create:**
- CONTRIBUTING.md
- CODEOWNERS
- PR template
- Feature READMEs
- ADR-001: State Architecture

## Immediate Cleanups

1. **Deduplicate atoms** - Single `isMainScriptAtom`, `openAtom`
2. **Unify resize** - One resize controller
3. **Extract focus logic** - Pure `computeFocusDecision`
4. **Remove DOM from selectors** - Move to `lib/dom.ts`
5. **Centralize IPC** - All through `services/ipc.ts`
6. **Fix type holes** - Replace `any` with proper types
7. **Polish naming** - Consistent atom names

## Definition of Done per PR

- ✅ No behavior change
- ✅ TypeScript strict passes
- ✅ No new `any` types
- ✅ Lint passes (no cycles)
- ✅ Tests for moved logic
- ✅ Docs updated if patterns changed
- ✅ Bundle size stable (±10%)

## Success Metrics

- New contributors can find code in <1 minute
- No DOM/IPC in atoms
- Unit tests for complex logic
- Single source of truth for each concern
- Clear separation of pure vs effectful code