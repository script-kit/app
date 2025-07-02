# Escape Key Bug Fix Summary

## Problems Fixed
1. **Original Race Condition**: When blurring a prompt and then refocusing it, the escape key often failed to dismiss the prompt unless pressed multiple times. This was caused by a race condition with the `justFocused` flag and inconsistent state management across blur/focus events.

2. **Child Process Override Issue**: The initial fix broke the ability for child process scripts to override `onEscape` behavior, preventing custom escape handling in user scripts.

## Solution Implemented: Visibility Controller with Child Process Awareness

### Changes Made:

1. **Created `app/src/main/visibility.ts`**
   - Centralized visibility state management
   - Deterministic focus/blur handling without timing windows
   - Unified escape key processing with quad-escape reload support
   - Single source of truth for window focus states
   - Child process awareness - escape propagates to child when `onEscape` is overridden

2. **Updated `app/src/main/prompt.ts`**
   - Removed `justFocused` flag and 100ms timeout (race condition source)
   - Integrated visibility controller in focus/blur handlers
   - Removed redundant state checks that are now handled centrally

3. **Updated `app/src/main/ipc.ts`**
   - Delegated escape handling to visibility controller
   - Passes child process state to controller for proper escape routing
   - Preserves ability for scripts to override `onEscape` behavior

4. **Created comprehensive unit tests in `app/src/main/visibility.test.ts`**
   - 13 tests covering all major scenarios
   - Race condition prevention tests
   - Multi-window state management tests
   - Child process escape propagation tests

## Manual QA Checklist

### Basic Functionality
- [ ] **Mac & Windows**: Open main menu, blur via clicking desktop, refocus, hit Esc once → menu hides
- [ ] Escape works immediately after refocusing (no multiple presses needed)
- [ ] Press Esc 4× fast → window reloads
- [ ] Ctrl/⌘-W still closes as before

### Edge Cases
- [ ] Emoji panel open → blur/escape has **no** effect
- [ ] DevTools open → blur is ignored, escape still works
- [ ] Multiple prompts open → escape affects only the focused one
- [ ] Rapid focus/blur/focus → escape works on first press

### Regression Testing
- [ ] Long-running script monitor still works (relies on blur events)
- [ ] Main menu behavior unchanged
- [ ] Snippet delay behavior unchanged
- [ ] Process termination on escape still works
- [ ] Scripts with custom `onEscape` handlers work correctly (escape propagates to child process)

## Benefits of This Solution

1. **Deterministic** - No more timing-based race conditions
2. **Testable** - Logic isolated from Electron, easily unit tested
3. **Maintainable** - All visibility logic in one place
4. **Extensible** - Easy to add new flags or behaviors
5. **Debuggable** - Clear state transitions with logging

## Files Modified
- `app/src/main/visibility.ts` (new)
- `app/src/main/visibility.test.ts` (new)
- `app/src/main/prompt.ts` (updated)
- `app/src/main/ipc.ts` (updated)

## How to Test the Fix
1. Run `pnpm dev` to start the app
2. Open any script/prompt
3. Click outside to blur the window
4. Click back on the prompt to focus
5. Press Escape once - it should hide immediately

The escape key should now work reliably on the first press after any blur/focus sequence.