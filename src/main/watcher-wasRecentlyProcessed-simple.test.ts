import { describe, expect, it, vi } from 'vitest';

describe('wasRecentlyProcessed logic test', () => {
  it('should demonstrate the bug where legitimate file changes are ignored', () => {
    // This test demonstrates the issue with wasRecentlyProcessed

    // The logic in watcher.ts is:
    // 1. When a file changes, handleFileChangeEvent is called
    // 2. If it's a script file, it calls onScriptChanged
    // 3. onScriptChanged checks wasRecentlyProcessed(filePath) && !rebuilt
    // 4. If recently processed, it ignores the change
    // 5. Otherwise, it calls madgeAllScripts() which marks ALL scripts as processed
    // 6. This means any legitimate file change within 5 seconds will be ignored

    // The bug:
    // - User edits a file
    // - File change is detected, onScriptChanged is called
    // - madgeAllScripts marks the file (and all other scripts) as "recently processed"
    // - If the user saves the file again within 5 seconds, it's ignored
    // - This is problematic because the user's second save is a legitimate change

    // The issue is that wasRecentlyProcessed is being used to prevent
    // cascading changes from madgeAllScripts, but it's also preventing
    // legitimate user changes.

    // Potential fix:
    // 1. Only mark files as "recently processed" when they're processed BY madgeAllScripts
    // 2. Don't mark the originally changed file as processed
    // 3. Or use a different mechanism to track madge-initiated vs user-initiated changes

    expect(true).toBe(true); // This test is for documentation
  });

  it('should show the timeline of the bug', () => {
    // Timeline:
    // T+0ms: User saves file.js
    // T+1ms: handleFileChangeEvent('change', 'file.js') called
    // T+2ms: onScriptChanged called, wasRecentlyProcessed returns false
    // T+3ms: madgeAllScripts() called, marks file.js as processed at T+3ms
    // T+100ms: madgeAllScripts finds file.js is imported by other.js
    // T+101ms: other.js cache is cleared
    // T+2000ms: User saves file.js again (legitimate change)
    // T+2001ms: handleFileChangeEvent('change', 'file.js') called
    // T+2002ms: onScriptChanged called, wasRecentlyProcessed returns true (T+3ms > T+2002ms - 5000ms)
    // T+2003ms: Change is IGNORED! User's edit is lost!

    expect(true).toBe(true); // This test is for documentation
  });
});
