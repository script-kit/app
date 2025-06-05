# Terminal Kill Behavior Tests

This directory contains tests that verify the terminal kill behavior fixes implemented to address the issue where terminals were not being properly killed when processes exited.

## Test Files

### `terminal-kill.test.ts`
A comprehensive test suite that simulates the terminal cleanup flow with event emitters and handlers. It tests:
- The issue: Terminal listeners not being cleaned up before the fix
- The fix: Proper TERM_KILL event emission in removeByPid
- Prompt close behavior improvements for process exit scenarios
- Memory leak prevention through proper listener cleanup

### `terminal-kill-simple.test.ts`
A simplified test suite that documents the behavior changes without complex mocking. It demonstrates:
- The problem: removeByPid not emitting TERM_KILL
- The solution: Adding TERM_KILL emission to trigger cleanup
- Terminal-specific handling with shorter debounce delays
- Prompt close logic improvements

## The Issue

Before the fix, when a process was removed via `removeByPid()`:
1. The process was removed from the array
2. The child process was killed
3. **BUT** the TERM_KILL event was never emitted

This meant that terminal cleanup handlers registered with `emitter.once(KitEvent.TERM_KILL, termKillHandler)` were never called, leading to:
- PTY processes not being killed
- IPC handlers not being removed  
- Memory leaks from accumulated event listeners

## The Fix

The fix involves two main changes:

### 1. Process Removal (process.ts)
```typescript
// In removeByPid method, before child?.kill()
processLog.info(`Emitting ${KitEvent.TERM_KILL} for ${pid}`);
emitter.emit(KitEvent.TERM_KILL, pid);
```

### 2. Prompt Close Logic (prompt.ts)
```typescript
// Skip focus checks if closing due to process exit
const isProcessExit = reason.includes('process-exit') || 
                     reason.includes('TERM_KILL') || 
                     reason.includes('removeByPid') || 
                     reason.includes('ProcessGone');

if (!kitState.allowQuit && !isProcessExit) {
  // Focus checks only apply to non-process-exit scenarios
}

// Skip cooldown for process exit scenarios  
if (this.closeCoolingDown && !isProcessExit) {
  // Cooldown only applies to non-process-exit scenarios
}
```

## Running the Tests

```bash
# Run all terminal kill tests
pnpm test src/main/terminal-kill.test.ts src/main/terminal-kill-simple.test.ts

# Run individual test files
pnpm test src/main/terminal-kill.test.ts
pnpm test src/main/terminal-kill-simple.test.ts
```

## Key Test Scenarios

1. **Listener Accumulation**: Verifies that TERM_KILL listeners don't accumulate over time
2. **Terminal Cleanup**: Ensures PTY processes and handlers are properly cleaned up
3. **Process Exit Detection**: Tests identification of process exit reasons
4. **Debounce Handling**: Verifies terminal kills bypass normal debouncing
5. **Prompt Close Behavior**: Ensures prompts close immediately on process exit

These tests help ensure that terminal resources are properly cleaned up when processes exit, preventing memory leaks and orphaned processes.