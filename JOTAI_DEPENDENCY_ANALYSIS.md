# Jotai.ts Dependency Analysis

## Impact Assessment

### Current State
- **File**: `src/renderer/src/jotai.ts`
- **Line Count**: 1687 lines
- **Exports**: 57 named exports
- **Dependent Files**: 115 files import from jotai.ts
- **Total Import Statements**: 228

### Most Used Exports
| Export | Usage Count | Risk Level |
|--------|-------------|------------|
| promptDataAtom | 6 imports | HIGH - Core state |
| uiAtom | 5 imports | HIGH - UI mode control |
| scoredChoicesAtom | 4 imports | HIGH - Choice display |
| channelAtom | 3 imports | HIGH - IPC communication |
| submittedAtom | 2 imports | MEDIUM |
| focusedChoiceAtom | 1 import | LOW |
| Other atoms | 1 each | LOW |

### Circular Dependency Risks

When extracting atoms, we must avoid creating circular dependencies. Current analysis shows:
- ✅ No circular dependencies currently exist
- ⚠️ Many atoms depend on each other within jotai.ts
- ⚠️ Extracting atoms that reference each other will create circular deps

### Safe Extraction Candidates

These atoms have minimal dependencies and can be safely extracted:

#### 1. Terminal State (LOW RISK)
- termConfigAtom
- termContextNameAtom
- termResultAtom
- termOutputAtom
- No cross-dependencies

#### 2. Mouse/Keyboard State (LOW RISK)
- mouseEnabledAtom
- isMouseDownAtom
- lastKeyDownWasModifierAtom
- Simple boolean/string atoms

#### 3. Visual/UI Flags (LOW RISK)
- isWindowAtom
- isFullScreenAtom
- isDarkAtom
- audioDotAtom
- Boolean flags with no dependencies

### High-Risk Extractions

These should NOT be extracted without careful refactoring:

#### 1. Core State Atoms (VERY HIGH RISK)
- promptDataAtom (6 imports, many internal deps)
- uiAtom (5 imports, complex logic)
- scoredChoicesAtom (4 imports, depends on multiple atoms)

#### 2. Submit Logic (HIGH RISK)
- submitValueAtom depends on:
  - uiAtom
  - flaggedChoiceValueAtom
  - focusedFlagValueAtom
  - focusedActionAtom
  - enterAtom
  - choiceInputsAtom
  - And more...

#### 3. Resize Logic (HIGH RISK)
- resize function depends on:
  - promptDataAtom
  - scoredChoicesAtom
  - uiAtom
  - mainHeightAtom
  - Multiple DOM queries

### Extraction Strategy

Based on this analysis, we should:

1. **Phase 1: Extract Simple Atoms** (Safe)
   - Terminal state atoms
   - Mouse/keyboard state
   - Visual flags
   - These have no dependencies

2. **Phase 2: Extract Utility Functions** (Safe)
   - checkSubmitFormat
   - Other pure functions
   - Move to utils files

3. **Phase 3: Create Facade Pattern** (Medium Risk)
   - Keep core atoms in jotai.ts
   - Create specialized files that re-export from jotai.ts
   - Gradually move logic to specialized files

4. **Phase 4: Refactor Core Atoms** (High Risk)
   - Only after establishing clear boundaries
   - May require significant refactoring
   - Consider using atom families or providers

### Files That Would Need Updates

If we extract promptDataAtom (6 imports):
- components/input.tsx
- components/header.tsx
- hooks/useMessages.ts
- hooks/useOpen.ts
- state/controllers/IPCController.tsx
- state/atoms/ui.ts

If we extract uiAtom (5 imports):
- App.tsx
- components/list.tsx
- hooks/useEscape.ts
- state/controllers/UIController.tsx
- state/atoms/preview.ts

### Recommendations

1. **DO NOT** extract interconnected atoms without careful planning
2. **START WITH** simple, independent atoms (terminal, mouse, visual flags)
3. **USE** re-exports to maintain backward compatibility
4. **TEST** each extraction thoroughly
5. **MEASURE** bundle size impact after each extraction

### Next Safe Steps

1. Extract terminal atoms to `state/atoms/terminal.ts` ✅ (already done)
2. Extract mouse/keyboard atoms to `state/atoms/interaction.ts`
3. Extract visual flag atoms to `state/atoms/visual-flags.ts`
4. Create utility functions file for pure functions
5. Set up re-export pattern for gradual migration