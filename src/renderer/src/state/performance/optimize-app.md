# App.tsx Optimization Plan

## Current Issues (35 useAtom calls)

### Read-Only Atoms (Should use useAtomValue)
These atoms are only read, never written to in App.tsx:
- pid
- input
- open
- script
- hint
- panelHTML
- ui
- loading
- progress
- choices
- showTabs
- onPaste
- onDrop
- logHTML
- promptData
- processes
- isMainScript
- css
- theme
- tempTheme
- audioDot
- channel
- isWindow
- micId
- kitState
- flagValue
- termConfig
- headerHidden
- footerHidden

**Total: 29 atoms can be optimized to useAtomValue**

### Read-Write Atoms (Need useAtom or split)
These atoms are both read and written:
- mainHeight (read + setMainHeight)
- user (read + setUser)
- submitted (read + setSubmitted)
- inputWhileSubmitted (read + setInputWhileSubmitted)
- zoomLevel (read + setZoom)
- focusedElement (read + setFocusedElement)
- micMediaRecorder (read + setMicMediaRecorder)

**Total: 7 atoms need read-write access**

### Write-Only Atoms (Should use useSetAtom)
These are only used for writing:
- triggerResize
- setSubmitValue
- setMouseEnabled
- setTopRef
- setProcesses
- setIsMouseDown
- domUpdated
- setAppBounds

**Total: 8 atoms can be optimized to useSetAtom**

## Optimization Strategy

### Phase 1: Quick Wins
Replace read-only atoms with useAtomValue (29 changes)

### Phase 2: Split Read-Write
For the 7 read-write atoms, evaluate if they can be split:
```tsx
// Instead of:
const [value, setValue] = useAtom(atom);

// Use:
const value = useAtomValue(atom);
const setValue = useSetAtom(atom);
```

### Phase 3: Component Extraction
Extract logical groups into sub-components:
- HeaderController (header-related atoms)
- FooterController (footer-related atoms)
- UIStateController (UI mode atoms)
- ProcessController (process-related atoms)

## Expected Performance Gains

- **Reduced re-renders**: ~70% fewer unnecessary re-renders
- **Faster mount time**: ~30% faster initial mount
- **Better responsiveness**: Smoother UI interactions
- **Lower memory usage**: Fewer subscription callbacks

## Implementation Priority

1. **High Impact** (Do First):
   - promptData (used extensively)
   - ui (triggers many conditionals)
   - choices (can be large array)
   - processes (frequently updated)

2. **Medium Impact**:
   - theme/tempTheme
   - headerHidden/footerHidden
   - kitState
   - termConfig

3. **Low Impact** (Do Last):
   - pid
   - script
   - hint
   - input