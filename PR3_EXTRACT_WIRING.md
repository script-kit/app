# PR 3: Extract Complex Wiring from jotai.ts - Implementation Plan

## Objective
Make jotai.ts thin (<400 lines) by extracting complex logic to appropriate controllers and services.

## Current Issues in jotai.ts

### 1. Complex resize() function (lines ~1050-1150)
- Direct DOM reads (`document.getElementById`)
- IPC sends (`ipcRenderer.send`)
- Complex resize computation logic
- Should move to `ResizeController`

### 2. Throttled focus logic (lines ~795-850)
- `throttleChoiceFocused` function
- Complex choice focus handling
- Should move to `FocusController` or `ChoicesController`

### 3. Module-level mutable variables
- `prevFocusedChoiceId`
- `prevChoiceIndexId`
- `wereChoicesPreloaded`
- Should be `useRef` in controllers

### 4. Direct IPC calls scattered throughout
- `ipcRenderer.send` calls in atoms
- Should use `services/ipc.ts`

### 5. DOM manipulation in atoms
- `requestAnimationFrame` loops
- `setTimeout` calls
- `document.getElementById` checks

## Extraction Plan

### Phase 1: Extract resize() to ResizeController

**Current resize() in jotai.ts:**
- Reads DOM heights
- Computes resize dimensions
- Sends IPC message
- Has debouncing logic

**Move to `state/controllers/ResizeController.tsx`:**
```typescript
// Merge with existing ResizeController
export function ResizeController() {
  const resize = useCallback(() => {
    // All resize logic here
    const heights = readDOMHeights(); // from lib/dom.ts
    const dimensions = computeResize(heights); // pure function
    send(Channel.RESIZE, dimensions);
  }, []);
  
  // Debounced version
  const debouncedResize = useMemo(
    () => debounce(resize, 100),
    [resize]
  );
  
  // Subscribe to resize triggers
  useEffect(() => {
    // Subscribe to atoms that trigger resize
  }, []);
  
  return null;
}
```

### Phase 2: Extract throttled focus logic

**Move `throttleChoiceFocused` to `ChoicesController`:**
```typescript
// state/controllers/ChoicesController.tsx
export function ChoicesController() {
  const prevFocusedIdRef = useRef<string>('');
  
  const handleFocusChange = useThrottle((choice: Choice) => {
    if (choice?.id === prevFocusedIdRef.current) return;
    prevFocusedIdRef.current = choice.id;
    // Focus logic here
  }, 100);
  
  const focusedChoice = useAtomValue(focusedChoiceAtom);
  useEffect(() => {
    handleFocusChange(focusedChoice);
  }, [focusedChoice]);
  
  return null;
}
```

### Phase 3: Remove module-level variables

**Replace with refs in controllers:**
- `prevFocusedChoiceId` → `useRef` in ChoicesController
- `prevChoiceIndexId` → `useRef` in IndexController
- `wereChoicesPreloaded` → atom or context

### Phase 4: Centralize IPC calls

**Create dedicated IPC controller:**
```typescript
// state/controllers/IPCController.tsx
export function IPCController() {
  const channel = useChannel();
  
  // Subscribe to outbound messages
  const resizeData = useAtomValue(resizeDataAtom);
  useEffect(() => {
    if (resizeData) {
      channel(Channel.RESIZE, resizeData);
    }
  }, [resizeData]);
  
  return null;
}
```

### Phase 5: Clean up jotai.ts

After extraction, jotai.ts should only contain:
1. Atom definitions
2. Simple selectors
3. Re-exports
4. No side effects, no DOM, no IPC

## Files to Create/Modify

### Create
- [ ] `lib/dom.ts` - DOM reading utilities
- [ ] `controllers/ChoicesController.tsx` - Choice focus logic
- [ ] `controllers/IndexController.tsx` - Index management
- [ ] `controllers/IPCController.tsx` - Centralized IPC

### Modify
- [ ] `controllers/ResizeController.tsx` - Add resize() function
- [ ] `jotai.ts` - Remove extracted logic
- [ ] `services/ipc.ts` - Ensure all IPC goes through here

### Delete from jotai.ts
- [ ] `resize()` function
- [ ] `throttleChoiceFocused`
- [ ] Module-level variables
- [ ] Direct `ipcRenderer` calls
- [ ] `requestAnimationFrame` loops

## Target jotai.ts Structure

```typescript
// jotai.ts after cleanup
import { atom } from 'jotai';
import type { Choice } from '../types';

// --- Base Atoms ---
export const _inputAtom = atom('');
export const _indexAtom = atom(0);

// --- Public Atoms ---
export const inputAtom = atom(
  (g) => g(_inputAtom),
  (g, s, value: string) => {
    s(_inputAtom, value);
  }
);

// --- Selectors ---
export const appStateAtom = atom((g) => ({
  input: g(inputAtom),
  index: g(indexAtom),
  // ... other state
}));

// --- Re-exports ---
export { focusedChoiceAtom } from './features/choices/atoms';
export { ResizeController } from './controllers/ResizeController';
```

## Verification Steps

1. **Line count**: `wc -l jotai.ts` < 400
2. **No side effects**: grep for `document.`, `ipcRenderer`, `setTimeout`
3. **App works**: Full functionality preserved
4. **Performance**: No regression in resize/focus

## Testing Checklist

- [ ] Resize works on window change
- [ ] Focus changes properly throttled
- [ ] IPC messages sent correctly
- [ ] No duplicate IPC messages
- [ ] Performance not degraded

## Migration Strategy

1. **Copy logic first** - Don't delete from jotai.ts yet
2. **Wire up controllers** - Add to App.tsx
3. **Verify working** - Test thoroughly
4. **Delete old code** - Remove from jotai.ts
5. **Clean imports** - Update all imports

## Rollback Plan

1. Keep `jotai.ts.backup`
2. If issues, restore and document
3. Smaller extraction chunks if needed