# Controllers Pattern

Controllers are React components that manage side effects and bridge the gap between pure Jotai atoms and the outside world (DOM, IPC, timers, etc.).

## Core Principles

1. **No UI Rendering** - Controllers return `null`
2. **Read-Only Atoms** - Subscribe to atoms with `useAtomValue`
3. **Write via Setters** - Use `useSetAtom` to update state
4. **Side Effects Only** - DOM, IPC, timers, API calls
5. **Cleanup on Unmount** - Properly clean up resources

## Controller Template

```tsx
import React, { useEffect, useRef, useCallback } from 'react';
import { useAtomValue, useSetAtom, useStore } from 'jotai';

export const ExampleController: React.FC = () => {
  const store = useStore();
  
  // Read atoms (never write directly)
  const someValue = useAtomValue(someAtom);
  
  // Write atoms (never read from these)
  const setSomeState = useSetAtom(someStateAtom);
  
  // Refs for persistent values across renders
  const previousValueRef = useRef<string>();
  
  // Side effects triggered by state changes
  useEffect(() => {
    if (someValue !== previousValueRef.current) {
      previousValueRef.current = someValue;
      
      // Perform side effect
      ipcRenderer.send('some-channel', someValue);
    }
  }, [someValue]);
  
  // Cleanup
  useEffect(() => {
    return () => {
      // Clean up resources
    };
  }, []);
  
  return null; // Controllers never render UI
};
```

## Current Controllers

### ResizeController
Manages window resizing based on content changes:
- Reads DOM element heights
- Calculates optimal window size
- Sends resize messages via IPC
- Debounces resize operations

### IPCController  
Central hub for IPC communication:
- Listens to state changes
- Sends messages to main process
- Manages message queuing
- Handles channel pausing

### FocusController
Manages focus state for choices:
- Tracks focused choice changes
- Maintains focus history
- Handles keyboard navigation
- Updates preview based on focus

### ChoicesController
Handles choice selection logic:
- Throttles choice focus changes
- Updates preview HTML
- Sends choice-focused events
- Manages choice input state

### UIController
Manages UI mode transitions:
- Checks for DOM element availability
- Sends IPC when UI changes
- Handles timing for UI transitions

## Adding a New Controller

1. Create file in `state/controllers/`
2. Follow the template structure
3. Add to App.tsx render tree
4. Document side effects handled

## Testing Controllers

Controllers should be tested with React Testing Library:

```tsx
import { render } from '@testing-library/react';
import { Provider } from 'jotai';
import { ExampleController } from './ExampleController';

test('sends IPC message on state change', () => {
  const mockSend = jest.fn();
  (window as any).electron = { ipcRenderer: { send: mockSend } };
  
  const { rerender } = render(
    <Provider>
      <ExampleController />
    </Provider>
  );
  
  // Trigger state change
  act(() => {
    // Update atom that controller watches
  });
  
  expect(mockSend).toHaveBeenCalledWith('expected-channel', 'expected-data');
});
```

## Best Practices

1. **Single Responsibility** - Each controller handles one concern
2. **No Business Logic** - Keep logic in atoms/selectors
3. **Debounce/Throttle** - Prevent excessive side effects
4. **Error Boundaries** - Handle errors gracefully
5. **Performance** - Use React.memo if needed
6. **Logging** - Use consistent logging patterns

## Anti-Patterns to Avoid

❌ **Don't put business logic in controllers**
```tsx
// Bad
const result = someValue * 2 + otherValue;
ipcRenderer.send('channel', result);

// Good  
const result = useAtomValue(computedResultAtom);
ipcRenderer.send('channel', result);
```

❌ **Don't read and write the same atom**
```tsx
// Bad
const [value, setValue] = useAtom(someAtom);

// Good
const value = useAtomValue(someAtom);
const setValue = useSetAtom(someAtom);
```

❌ **Don't forget cleanup**
```tsx
// Bad
useEffect(() => {
  const timer = setTimeout(...);
  // No cleanup!
}, []);

// Good
useEffect(() => {
  const timer = setTimeout(...);
  return () => clearTimeout(timer);
}, []);
```

## Migration Checklist

When extracting side effects from atoms to controllers:

- [ ] Identify all side effects in the atom
- [ ] Create new controller or extend existing one
- [ ] Move side effects to useEffect hooks
- [ ] Replace atom side effects with pure logic
- [ ] Add controller to App.tsx
- [ ] Test that functionality still works
- [ ] Document what the controller handles