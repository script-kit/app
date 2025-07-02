# Prompt Focus Fix for Snippet-Triggered Scripts

## Problem
When a script was triggered by a snippet (e.g., typing "hello,,"), the prompt window was created but not shown or focused, leaving the user unable to interact with it.

## Root Cause
In `kit.ts`, the `runPromptProcess` function had different behavior for main menu vs other scripts:

```typescript
if (isMain) {
  prompt.initMainBounds();
  prompt.initShowPrompt();  // ✅ Shows and focuses the window
} else {
  prompt.moveToMouseScreen();  // ❌ Only moves window, doesn't show it
}
```

The `moveToMouseScreen()` method only sets the window position but doesn't:
- Show the window
- Focus the window
- Make it ready for user input

## Fix Applied
Added `prompt.initShowPrompt()` call for non-main scripts:

```typescript
if (isMain) {
  prompt.initMainBounds();
  prompt.initShowPrompt();
} else {
  prompt.moveToMouseScreen();
  prompt.initShowPrompt();  // ✅ Now shows and focuses the window
}
```

## What `initShowPrompt()` Does
From `prompt.ts` (lines 1785-1797):
1. Restores window if minimized (on non-Mac with specific env var)
2. Sets window to always on top
3. Calls `focusPrompt()` to:
   - Make window focusable
   - Show the window
   - Focus for user input
   - Handle visibility state
4. Sends `SET_OPEN` message to renderer

## Testing the Fix
1. Create a snippet script with `// Snippet: *,,`
2. Type "hello,," in any application
3. The prompt should now:
   - Appear on screen
   - Be focused and ready for input
   - Accept keyboard input immediately

## Related Components
- `tick.ts`: Detects snippets and triggers scripts
- `kit.ts`: Manages script execution and prompt setup
- `prompt.ts`: Handles window display and focus
- `visibility.ts`: Manages focus/blur states