# Main Menu Escape Key Fix

## Issue
The main menu was not dismissing when the escape key was pressed immediately after opening it via the keyboard shortcut.

## Root Cause Analysis
1. The `hideOnEscape` property defaults to `false` in `prompt.ts` (line 582)
2. The main menu script doesn't explicitly set `hideOnEscape: true` in its prompt data
3. Even if it did, the escape handling logic in `visibility.ts` would pass the escape to the child process instead of hiding the window when a child process exists

## Solution
Added special handling for the main menu in `visibility.ts` using the existing `getMainScriptPath()` pattern:

```typescript
// Special handling for main menu - always hide on escape
if (prompt.scriptPath === getMainScriptPath()) {
  log.info('␛ Main menu detected - hiding on escape');
  prompt.maybeHide(HideReason.Escape);
  prompt.sendToPrompt(Channel.SET_INPUT, '');
  return true; // We handled it
}
```

This ensures that:
- The main menu always hides on escape, regardless of the `hideOnEscape` setting
- The escape key is handled immediately without being passed to the child process
- The behavior is consistent with user expectations for the main menu
- Uses the existing pattern for checking if the current script is the main menu

## Existing Features Preserved
- **Dev Tools Handling**: The `handleBlur` method already checks if dev tools are open and ignores blur events in that case (line 66-69)
- **Emoji Panel Handling**: The `handleBlur` method also checks for active emoji panel and ignores blur events (line 61-64)

## Testing
Added comprehensive tests in `visibility.test.ts` to verify:
- Main menu always hides on escape
- Regular scripts respect the `hideOnEscape` setting
- The fix doesn't affect other scripts' escape behavior
- Dev tools and emoji panel blur handling continues to work correctly

## Additional Issue Fixed: DevTools Closing Main Menu

### Problem
Opening DevTools on the main menu would immediately close the main menu because:
1. Opening DevTools causes the window to blur
2. The blur event fires before the `devtools-opened` event
3. The main menu's blur handler closes the window before we can detect DevTools are opening

### Root Cause
The timing issue where blur event fires before DevTools can be detected as open. The old code had checks for `isDevToolsOpened()` directly in the blur handler, but after the visibility refactor, this was moved to a controller that couldn't catch the timing issue.

### Solution
Implemented a comprehensive fix with multiple layers of protection:

1. **Added `devToolsOpening` flag** to track when DevTools are about to open
2. **Intercept DevTools keyboard shortcuts** (Ctrl/Cmd+Shift+I and F12) before blur happens
3. **Handle right-click context menu** DevTools option
4. **Check flag in blur handler** to prevent closing main menu
5. **Re-add blur handler** when DevTools close
6. **Prevent hiding on DevTools close** for main menu

```typescript
// Flag to track DevTools opening
devToolsOpening = false;

// Intercept keyboard shortcuts before blur
this.window.webContents?.on('before-input-event', (_event, input) => {
  const isDevToolsShortcut = 
    ((input.control || input.meta) && input.shift && input.key.toLowerCase() === 'i') ||
    input.key === 'F12';
    
  if (isDevToolsShortcut) {
    this.devToolsOpening = true;
    setTimeout(() => { this.devToolsOpening = false; }, 200);
  }
});

// Check flag in blur handler
if (isMainScript && !this.mainMenuPreventCloseOnBlur) {
  if (this.devToolsOpening) {
    this.logInfo('Main menu blur ignored - DevTools are opening');
    return;
  }
  // ... normal blur handling
}
```

## Additional Issue Fixed: Focus Stealing When DevTools Open

### Problem
When DevTools are open, the app continues to steal focus from the DevTools console, making it impossible to type in the DevTools.

### Solution
Implemented a comprehensive fix to disable focus stealing when DevTools are open:

1. **Main Process**:
   - Modified `forceFocus()` to skip focusing when DevTools are open
   - Updated `FOCUS_KIT_WINDOW` handler to check DevTools state
   - Send DevTools state to renderer when DevTools open/close

2. **Renderer Process**:
   - Added `devToolsOpenAtom` to track DevTools state
   - Updated `focusPromptEffect` to skip focus requests when DevTools open
   - Modified `useFocus` hook to not steal focus when DevTools open

```typescript
// Main process - skip focus when DevTools open
forceFocus = () => {
  if (this.window?.webContents?.isDevToolsOpened()) {
    this.logInfo('DevTools are open - skipping forceFocus');
    return;
  }
  this.window?.show();
  this.window?.focus();
};

// Renderer - don't send focus request when DevTools open
export const focusPromptEffect = atomEffect((get) => {
  get(inputFocusAtom);
  const devToolsOpen = get(devToolsOpenAtom);
  if (!devToolsOpen) {
    window.electron.ipcRenderer.send(AppChannel.FOCUS_PROMPT);
  }
});
```

## Files Modified
1. `/Users/johnlindquist/dev/kit-container/app/src/main/visibility.ts` - Added main menu escape handling
2. `/Users/johnlindquist/dev/kit-container/app/src/main/visibility.test.ts` - Added tests for main menu escape
3. `/Users/johnlindquist/dev/kit-container/app/src/main/prompt.ts` - Fixed DevTools issues (closing main menu, focus stealing)
4. `/Users/johnlindquist/dev/kit-container/app/src/main/messages.ts` - Added DevTools check to focus handler
5. `/Users/johnlindquist/dev/kit-container/app/src/renderer/src/jotai.ts` - Added devToolsOpenAtom
6. `/Users/johnlindquist/dev/kit-container/app/src/renderer/src/hooks/useMessages.ts` - Added DEV_TOOLS handler
7. `/Users/johnlindquist/dev/kit-container/app/src/renderer/src/effects/focusPrompt.ts` - Check DevTools before focus
8. `/Users/johnlindquist/dev/kit-container/app/src/renderer/src/hooks/useFocus.ts` - Disable focus when DevTools open