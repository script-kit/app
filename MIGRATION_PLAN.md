# Jotai.ts Migration Plan

## Current Situation
- **1560 lines** in jotai.ts (target: <400) - **127 lines reduced!**
- **115 files** depend on it
- **High interdependencies** between atoms

## Progress Update
- ✅ Facade pattern established
- ✅ Critical imports updated to use facade
- ✅ 13 atoms successfully extracted
- 🚀 No circular dependencies introduced
- 🎯 1160 more lines to reduce to reach target

## Migration Strategy: Facade Pattern

### Phase 1: Setup Facade (✅ DONE)
1. Created `state/facade/index.ts`
2. Re-exports everything from jotai.ts
3. Provides backward compatibility

### Phase 2: Update Import Paths (✅ DONE)
Instead of:
```typescript
import { uiAtom, promptDataAtom } from '../jotai';
```

Use:
```typescript
import { uiAtom, promptDataAtom } from '../state/facade';
```

This allows us to move atoms without breaking imports.

### Phase 3: Gradual Extraction
Move atoms one by one to feature files:

#### Safe to Move (Low Risk):
1. **Exit/Close atoms** (~50 lines)
   - exitAtom
   - blurAtom
   - escapeAtom

2. **Utility atoms** (~100 lines)
   - appendInputAtom
   - valueInvalidAtom
   - preventSubmitAtom
   - toggleSelectedChoiceAtom
   - toggleAllSelectedChoicesAtom

3. **Color/Theme utilities** (~50 lines)
   - colorAtom
   - Related helper functions

#### Medium Risk:
1. **Tab management** (~80 lines)
   - tabIndexAtom
   - Related tab logic

2. **Keyboard/shortcut atoms** (~150 lines)
   - shortcutStringsAtom
   - sendShortcutAtom
   - triggerKeywordAtom

#### High Risk (Move Last):
1. **Core state** (~300 lines)
   - promptDataAtom
   - uiAtom
   - scoredChoicesAtom

2. **Submit logic** (~200 lines)
   - submitValueAtom
   - submitInputAtom
   - enterButtonNameAtom
   - enterButtonDisabledAtom

3. **Resize system** (~200 lines)
   - resize function
   - triggerResizeAtom
   - mainHeightAtom

### Phase 4: Clean Up
1. Remove empty sections from jotai.ts
2. Consolidate remaining interdependent atoms
3. Consider breaking into smaller focused modules

## Implementation Steps

### Step 1: Update Critical Imports (5 files)
Update the most commonly importing files first:
- App.tsx
- components/input.tsx
- components/list.tsx
- hooks/useMessages.ts
- state/controllers/IPCController.tsx

### Step 2: Extract Utility Atoms (✅ DONE)
Moved to `state/atoms/utilities.ts`:
- appendInputAtom
- valueInvalidAtom
- preventSubmitAtom
- toggleSelectedChoiceAtom
- toggleAllSelectedChoicesAtom

### Step 3: Extract Exit/Close Logic (✅ DONE)
Moved to `state/atoms/lifecycle.ts`:
- exitAtom
- blurAtom
- escapeAtom

### Step 3.5: Extract Action/Theme Atoms (✅ DONE)
Moved to `state/atoms/actions-utils.ts`:
- sendShortcutAtom
- sendActionAtom
- triggerKeywordAtom
- getEditorHistoryAtom

Moved to `state/atoms/theme-utils.ts`:
- colorAtom

### Step 4: Measure Progress
After each extraction:
- Run tests
- Check line count
- Verify no circular dependencies
- Update facade exports

## Success Metrics
- [ ] jotai.ts under 1000 lines (Phase 1 goal)
- [ ] jotai.ts under 600 lines (Phase 2 goal)
- [ ] jotai.ts under 400 lines (Final goal)
- [x] No circular dependencies (verified)
- [ ] All tests passing (2 unrelated test failures)
- [x] No runtime errors (app runs correctly)

## Risk Mitigation
1. **Use facade pattern** for backward compatibility
2. **Test after each extraction**
3. **Move simple atoms first**
4. **Keep interdependent atoms together**
5. **Document all moves in facade file**

## Next Action
Start with Step 1: Update 5 critical files to use facade imports