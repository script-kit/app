# PR 2: Kill Duplicate Atoms - Implementation Plan

## Objective
Establish single source of truth for each atom by removing duplicates and creating clear import paths.

## Duplicate Atoms Found

### 1. `isMainScriptAtom`
**Current locations:**
- ✅ `state/shared-atoms.ts` (line 8) - KEEP THIS ONE
- ❌ `state/atoms/script-state.ts` (line 19) - DELETE
- ❌ `jotai.ts` imports from shared-atoms - KEEP IMPORT

**Files that import it:**
- `src/renderer/src/App.tsx`
- `src/renderer/src/hooks/useTab.ts`
- `src/renderer/src/state/selectors/scriptSelectors.ts`
- `src/renderer/src/state/prompt-data.ts`
- `src/renderer/src/state/script-state.ts`
- `src/renderer/src/state/controllers/ResizeController.tsx`
- `src/renderer/src/components/icon.tsx`
- `src/renderer/src/components/header.tsx`

### 2. `openAtom`
**Current locations:**
- ❌ `jotai.ts` (line 211) - DELETE (uses inline reset)
- ✅ `state/app-lifecycle.ts` (line 41) - KEEP (uses resetPromptState)
- ❌ `state/app-core.ts` (line 94) - DELETE
- ❌ `state/atoms/lifecycle.ts` (commented out) - DELETE FILE if empty

### 3. `promptDataAtom`
Need to search for duplicates...

### 4. `inputAtom` 
Need to verify duplicates...

## Step-by-Step Changes

### Phase 1: Remove isMainScriptAtom duplicates

1. **DELETE** the duplicate in `state/atoms/script-state.ts:19`
2. **UPDATE** all imports to use `state/shared-atoms`
3. **VERIFY** no broken imports

### Phase 2: Consolidate openAtom

1. **KEEP** `state/app-lifecycle.ts:41` version (it properly uses resetPromptState)
2. **DELETE** duplicate in `jotai.ts:211`
3. **DELETE** duplicate in `state/app-core.ts:94`
4. **UPDATE** jotai.ts to import from `state/app-lifecycle`
5. **VERIFY** reset logic works consistently

### Phase 3: Create barrel export

Create `state/index.ts`:
```typescript
// Single source of truth exports
export { isMainScriptAtom } from './shared-atoms';
export { openAtom } from './app-lifecycle';
export { promptDataAtom } from './prompt-data';
export { inputAtom } from './shared-atoms';
// ... other canonical exports
```

### Phase 4: Update all imports

Update all files to import from the barrel:
```typescript
import { isMainScriptAtom, openAtom, inputAtom } from '../state';
```

## Verification Steps

1. **Build passes**: `pnpm build`
2. **Type check passes**: `pnpm typecheck`
3. **App starts**: `pnpm dev`
4. **Main script detection works**: Test with a main script
5. **Open/close lifecycle works**: Test prompt open/close

## Files to Modify

### Delete/Clean
- [ ] `state/atoms/script-state.ts` - Remove isMainScriptAtom
- [ ] `state/atoms/lifecycle.ts` - Remove if empty
- [ ] `state/app-core.ts` - Remove openAtom
- [ ] `jotai.ts` - Remove openAtom definition

### Update Imports
- [ ] `src/renderer/src/App.tsx`
- [ ] `src/renderer/src/hooks/useTab.ts`
- [ ] `src/renderer/src/state/selectors/scriptSelectors.ts`
- [ ] `src/renderer/src/state/prompt-data.ts`
- [ ] `src/renderer/src/state/script-state.ts`
- [ ] `src/renderer/src/state/controllers/ResizeController.tsx`
- [ ] `src/renderer/src/components/icon.tsx`
- [ ] `src/renderer/src/components/header.tsx`
- [ ] `jotai.ts` - Import openAtom from app-lifecycle

### Create
- [ ] `state/index.ts` - Barrel export for canonical atoms

## Testing Checklist

- [ ] Main script flag properly detected
- [ ] Open/close resets state correctly
- [ ] No console errors about missing atoms
- [ ] Input atom updates properly
- [ ] Prompt data flows correctly

## Rollback Plan

If issues arise:
1. Git stash changes
2. Restore from jotai.ts.backup
3. Document the specific issue
4. Adjust approach based on findings