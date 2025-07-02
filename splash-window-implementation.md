# Splash Screen Window Implementation

## Overview
This implementation converts the Script Kit splash screen from a panel window to a regular window, allowing users to minimize or background it during the installation process.

## Key Changes

### 1. Window Configuration (`prompt.options.ts`)
- Added `isSplashScreen` parameter to `getPromptOptions()` function
- When `isSplashScreen` is true:
  - `type: undefined` (instead of `'panel'`) - creates a regular window
  - `minimizable: true` - allows minimizing
  - `skipTaskbar: false` - shows in taskbar
  - `focusable: true` - ensures proper keyboard focus
  - `frame: true` - shows window controls (minimize, maximize, close)
  - No vibrancy effects on macOS for better regular window behavior

### 2. Prompt Initialization (`prompt.ts`)
- Constructor detects `UI.splash` and passes `isSplashScreen = true` to window options
- Removed special blur handling for splash screen - uses standard blur handler
- Added splash screen check in `setPromptAlwaysOnTop()` to prevent always-on-top behavior
- Updated `focusPrompt()` to use normal window focus for splash screens
- Simplified `makeSplashWindow()` as no special handling is needed

### 3. Installation Process (`install.ts`)
- Removed `setAlwaysOnTop(true)` from `setupDone()` function
- Splash window can now be minimized/backgrounded during installation

### 4. Focus Management
- `onBlur()` handler checks for splash screen and prevents auto-hide
- Normal window focus methods are used instead of panel-specific `makeKeyPanel()`

## Preserved Functionality

### Escape Key Behavior
The existing escape key handling in `useEscape.ts` is preserved:
- When `UI.splash` is detected and escape is pressed, it runs `runMainScript()` instead of hiding
- This allows users to skip the survey and proceed to the main menu

### Form Input
- Keyboard input works normally as the window is focusable
- Tab navigation and form interactions are preserved

### Window Transitions
- Smooth transition from splash screen to main script
- Window closes properly when installation completes or user skips

## Platform Compatibility

### macOS
- Regular window without panel-specific behaviors
- No vibrancy effects for consistent window appearance
- Standard window controls available

### Windows/Linux
- Standard window behavior maintained
- Proper focus handling without panel-specific code

## Benefits
1. Users can minimize the splash screen and continue working
2. Installation can proceed in the background
3. Window appears in taskbar for easy access
4. Standard window controls provide familiar UX
5. No breaking changes to existing prompt functionality

## Testing Checklist
- [ ] Splash screen appears as regular window with controls
- [ ] Window can be minimized and restored
- [ ] Keyboard input works in survey form
- [ ] Escape key skips survey and opens main menu
- [ ] Installation completes successfully in background
- [ ] Window transitions smoothly to main script
- [ ] Other prompts continue to work as panels
- [ ] No regression in existing prompt behaviors