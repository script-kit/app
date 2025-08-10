# Performance Optimization Guide

## Key Performance Issues Identified

### 1. Excessive useAtom Usage in App.tsx
- **Problem**: App.tsx uses 35+ `useAtom` calls, causing unnecessary re-renders
- **Solution**: Replace with `useAtomValue` for read-only atoms

### 2. Missing React.memo
- **Problem**: Components re-render even when props haven't changed
- **Solution**: Wrap pure components with React.memo

### 3. Inline Function Creation
- **Problem**: Creating new functions on every render breaks memoization
- **Solution**: Use useCallback for event handlers

## Optimization Strategies

### 1. Read vs Write Separation

```tsx
// ❌ Bad - causes re-renders on every atom change
const [value, setValue] = useAtom(someAtom);

// ✅ Good - only re-renders when value changes
const value = useAtomValue(someAtom);
const setValue = useSetAtom(someAtom); // Use only if needed
```

### 2. Component Memoization

```tsx
// ❌ Bad - re-renders on every parent render
export const MyComponent = ({ data }) => {
  return <div>{data}</div>;
};

// ✅ Good - only re-renders when props change
export const MyComponent = React.memo(({ data }) => {
  return <div>{data}</div>;
});
```

### 3. Event Handler Optimization

```tsx
// ❌ Bad - creates new function every render
<button onClick={() => handleClick(id)}>Click</button>

// ✅ Good - reuses the same function
const handleClick = useCallback((id) => {
  // handle click
}, [dependencies]);
<button onClick={handleClick}>Click</button>
```

### 4. Atom Selector Pattern

```tsx
// ❌ Bad - subscribes to entire atom
const promptData = useAtomValue(promptDataAtom);
const ui = promptData.ui;

// ✅ Good - only subscribes to specific field
const uiAtom = atom((get) => get(promptDataAtom).ui);
const ui = useAtomValue(uiAtom);
```

## Performance Metrics to Track

1. **Re-render Count**: Use React DevTools Profiler
2. **Component Mount Time**: Measure with performance.now()
3. **Memory Usage**: Monitor with Chrome DevTools
4. **Bundle Size**: Track with webpack-bundle-analyzer

## High-Priority Optimizations

### App.tsx Optimizations
1. Replace 30+ `useAtom` with `useAtomValue` where appropriate
2. Split App.tsx into smaller, memoized components
3. Move effects to dedicated controller components

### List Component Optimizations
1. Implement virtualization for large lists
2. Memoize list items
3. Use stable keys

### Search Optimizations
1. Debounce search input
2. Memoize search results
3. Use Web Workers for heavy computations

## Component-Specific Recommendations

### Input Component
- Use uncontrolled components where possible
- Debounce onChange handlers
- Memoize validation functions

### Preview Component
- Lazy load preview content
- Use intersection observer for visibility
- Cache sanitized HTML

### Choice List
- Virtualize long lists (already using react-window)
- Memoize choice items
- Optimize scoring algorithm

## Testing Performance

```bash
# Run performance benchmarks
pnpm bench

# Profile with React DevTools
# 1. Open Chrome DevTools
# 2. Go to Profiler tab
# 3. Record interaction
# 4. Analyze flame graph
```

## Monitoring in Production

1. Add performance marks
2. Use Performance Observer API
3. Send metrics to analytics
4. Set up alerts for regressions

## Next Steps

1. [ ] Audit all components for useAtom usage
2. [ ] Add React.memo to pure components
3. [ ] Implement useCallback for event handlers
4. [ ] Create performance benchmarks
5. [ ] Set up continuous performance monitoring