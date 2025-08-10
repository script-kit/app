# State Architecture Conventions

## Core Principles

1. **Single Source of Truth** - Each piece of state has exactly one canonical definition
2. **Pure vs Effectful** - Clear separation between pure computation and side effects
3. **Feature Isolation** - Features are self-contained with clear boundaries
4. **Predictable Patterns** - Consistent naming and structure across all features

## File Structure

```
state/
  features/
    [feature-name]/
      atoms.ts        # Private base atoms + public RW atoms
      derived.ts      # Pure derived atoms/selectors
      controller.tsx  # React component with side effects
      services.ts     # Async operations (IPC/HTTP/FS)
      types.ts        # Feature-specific types
      README.md       # Feature documentation
      __tests__/      # Feature tests
  lib/
    *.ts             # Pure utility functions only
  core/
    store.ts         # Jotai store configuration
    conventions.md   # This file
  index.ts           # Public API barrel export
```

## Atom Patterns

### Base Atoms (Private)
```typescript
// atoms.ts - Never export these directly
const _inputAtom = atom('');
const _flagsAtom = atom<Flags>({});
```

### Public Read/Write Atoms
```typescript
// atoms.ts - Export these
export const inputAtom = atom(
  (g) => g(_inputAtom),                    // getter
  (g, s, value: string) => {               // setter
    // validation/transformation
    s(_inputAtom, value);
  }
);
```

### Derived Atoms (Read-only)
```typescript
// derived.ts - Pure computations only
export const inputLengthAtom = atom(
  (g) => g(inputAtom).length
);

export const isEmptyAtom = atom(
  (g) => g(inputAtom) === ''
);
```

### Action Atoms
```typescript
// atoms.ts - Verbs that perform actions
export const appendInputAtom = atom(
  null,
  (g, s, text: string) => {
    const current = g(_inputAtom);
    s(_inputAtom, current + text);
  }
);
```

## Naming Conventions

### Atoms
- **Private base**: `_fooAtom` (underscore prefix)
- **Public RW**: `fooAtom`
- **Derived/Selector**: `fooSelector` or `derivedFooAtom`
- **Actions**: `verbNounAtom` (e.g., `appendInputAtom`, `resetStateAtom`)
- **Booleans**: `isFooAtom`, `hasFooAtom`, `shouldFooAtom`

### Files
- **atoms.ts** - Atom definitions
- **derived.ts** - Pure selectors
- **controller.tsx** - Side effect components
- **services.ts** - Async operations
- **types.ts** - TypeScript types

### Components
- **Controllers**: `FooController` (no UI, only effects)
- **Services**: `fooService` (singleton instances)

## Controller Pattern

Controllers are React components that:
1. Subscribe to atoms (read-only)
2. Perform side effects
3. Write to setter atoms
4. Return `null` (no UI)

```typescript
// features/input/controller.tsx
export function InputController() {
  // Read state
  const value = useAtomValue(inputValueAtom);
  const isValid = useAtomValue(isValidAtom);
  
  // Side effects
  const send = useChannel();
  
  // React to changes
  useEffect(() => {
    if (isValid) {
      send(Channel.INPUT, { value });
    }
  }, [value, isValid, send]);
  
  // No UI
  return null;
}
```

## Purity Rules

### ✅ Pure (atoms.ts, derived.ts, lib/)
- Mathematical computations
- Data transformations
- Filtering/mapping
- Memoization
- Type guards

### ❌ Not Pure (controllers/, services/)
- `document.*` DOM access
- `window.*` browser APIs
- `ipcRenderer` IPC calls
- `setTimeout/setInterval` timers
- `fetch/axios` HTTP calls
- `fs/path` file system
- `console.log` logging
- Random number generation
- Date.now() calls

## Side Effect Boundaries

```typescript
// ❌ BAD - Side effect in atom
export const heightAtom = atom(
  () => document.getElementById('main')?.offsetHeight ?? 0
);

// ✅ GOOD - Pure atom + controller
// atoms.ts
export const heightAtom = atom(0);

// controller.tsx
export function HeightController() {
  const setHeight = useSetAtom(heightAtom);
  
  useEffect(() => {
    const element = document.getElementById('main');
    if (element) {
      setHeight(element.offsetHeight);
    }
  }, []);
  
  return null;
}
```

## Import/Export Rules

### Public API (state/index.ts)
```typescript
// Only export what consumers need
export { inputAtom, isValidAtom } from './features/input/atoms';
export { InputController } from './features/input/controller';
export type { InputState } from './features/input/types';
```

### Internal Imports
```typescript
// ✅ Within feature - can import private atoms
import { _inputAtom } from './atoms';

// ❌ Cross-feature - only import from index
import { _inputAtom } from '../input/atoms';  // BAD
import { inputAtom } from '../../index';       // GOOD
```

## Testing Strategy

### Pure Functions (lib/, derived)
- Unit tests with Vitest
- Table-driven tests
- Property-based tests
- No mocking needed

### Controllers
- React Testing Library
- Mock side effects
- Test behavior not implementation
- Verify IPC calls made

### Services
- Mock external dependencies
- Test error handling
- Verify retry logic

## Type Safety

### Strict Mode
```typescript
// tsconfig.json
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true
  }
}
```

### No Any
```typescript
// ❌ BAD
const data: any = getData();

// ✅ GOOD
const data: unknown = getData();
const parsed = DataSchema.parse(data);
```

### Discriminated Unions
```typescript
// ✅ GOOD - Type-safe messages
type AppMessage = 
  | { type: 'RESIZE'; payload: ResizeData }
  | { type: 'INPUT'; payload: string }
  | { type: 'ERROR'; payload: Error };
```

## Performance Guidelines

### Memoization
```typescript
// Expensive computations
export const expensiveAtom = atom((g) => {
  const items = g(itemsAtom);
  return useMemo(
    () => computeExpensive(items),
    [items]
  );
});
```

### Batching
```typescript
// Batch multiple updates
import { unstable_batchedUpdates } from 'react-dom';

unstable_batchedUpdates(() => {
  setA(1);
  setB(2);
  setC(3);
});
```

### Debouncing
```typescript
// In controllers only
const debouncedSave = useMemo(
  () => debounce(save, 500),
  [save]
);
```

## Migration Checklist

When refactoring existing code:

- [ ] Identify all duplicates
- [ ] Choose canonical location
- [ ] Extract side effects to controllers
- [ ] Add proper types
- [ ] Write tests for extracted logic
- [ ] Update imports
- [ ] Verify no behavior change
- [ ] Update documentation

## Common Pitfalls to Avoid

1. **Creating new arrays/objects in getters** - Causes unnecessary re-renders
2. **Side effects in atoms** - Makes testing impossible
3. **Circular dependencies** - Use selectors to break cycles
4. **Missing error boundaries** - Controllers should handle errors
5. **Synchronous IPC** - Always use async patterns
6. **Direct DOM manipulation** - Use React refs when possible
7. **Module-level state** - Use atoms or refs instead

## Questions?

For questions about these conventions:
1. Check existing examples in codebase
2. Refer to Jotai documentation
3. Ask in PR review
4. Update this document with clarifications