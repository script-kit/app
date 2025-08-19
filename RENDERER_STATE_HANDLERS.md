# Renderer State Handlers for Window Mode Switching

This document describes the handlers that need to be implemented in the renderer to support state preservation when switching between panel and window modes.

## Required Handlers

### 1. REQUEST_RENDERER_STATE Handler

The renderer needs to listen for `AppChannel.REQUEST_RENDERER_STATE` and collect the current state:

```typescript
import { ipcRenderer } from 'electron';
import { AppChannel } from '../shared/enums';

ipcRenderer.on(AppChannel.REQUEST_RENDERER_STATE, (_e, { responseChannel }) => {
  const state = collectCurrentState();
  ipcRenderer.send(responseChannel, state);
});

function collectCurrentState() {
  // Collect all relevant state from the UI
  return {
    // Input/Editor content
    input: getInputValue(),           // Current input field value
    value: getEditorContent(),        // Editor content if in editor mode
    description: getDescription(),    // Any description field value
    
    // UI state
    scrollTop: getScrollPosition(),   // Current scroll position
    selectionStart: getSelectionStart(), // Text selection start
    selectionEnd: getSelectionEnd(),     // Text selection end
    caretPosition: getCaretPosition(),   // Cursor position in editor
    
    // Component-specific state
    activeTab: getActiveTab(),        // Active tab if tabs are present
    expandedItems: getExpandedItems(), // Expanded tree items
    selectedChoices: getSelectedChoices(), // Selected items in list
    
    // Any other UI state that should persist
    customState: getCustomState()
  };
}
```

### 2. RESTORE_RENDERER_STATE Handler

The renderer needs to listen for `AppChannel.RESTORE_RENDERER_STATE` and restore the state:

```typescript
ipcRenderer.on(AppChannel.RESTORE_RENDERER_STATE, (_e, state) => {
  if (!state) return;
  
  restoreState(state);
});

function restoreState(state) {
  // Restore input/editor content
  if (state.input !== undefined) {
    setInputValue(state.input);
  }
  
  if (state.value !== undefined) {
    setEditorContent(state.value);
  }
  
  if (state.description !== undefined) {
    setDescription(state.description);
  }
  
  // Restore UI state
  if (state.scrollTop !== undefined) {
    setScrollPosition(state.scrollTop);
  }
  
  if (state.selectionStart !== undefined && state.selectionEnd !== undefined) {
    setSelection(state.selectionStart, state.selectionEnd);
  }
  
  if (state.caretPosition !== undefined) {
    setCaretPosition(state.caretPosition);
  }
  
  // Restore component-specific state
  if (state.activeTab !== undefined) {
    setActiveTab(state.activeTab);
  }
  
  if (state.expandedItems) {
    setExpandedItems(state.expandedItems);
  }
  
  if (state.selectedChoices) {
    setSelectedChoices(state.selectedChoices);
  }
  
  // Restore any custom state
  if (state.customState) {
    restoreCustomState(state.customState);
  }
}
```

## Implementation Tips

### For Input Fields
```typescript
function getInputValue() {
  const input = document.querySelector('input#main-input');
  return input?.value;
}

function setInputValue(value) {
  const input = document.querySelector('input#main-input');
  if (input) {
    input.value = value;
    // Trigger any necessary events
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }
}
```

### For CodeMirror/Monaco Editors
```typescript
function getEditorContent() {
  // For CodeMirror
  if (window.cmEditor) {
    return window.cmEditor.getValue();
  }
  
  // For Monaco
  if (window.monacoEditor) {
    return window.monacoEditor.getValue();
  }
  
  return null;
}

function setEditorContent(value) {
  // For CodeMirror
  if (window.cmEditor && value) {
    window.cmEditor.setValue(value);
  }
  
  // For Monaco
  if (window.monacoEditor && value) {
    window.monacoEditor.setValue(value);
  }
}

function getCaretPosition() {
  // For CodeMirror
  if (window.cmEditor) {
    const cursor = window.cmEditor.getCursor();
    return { line: cursor.line, ch: cursor.ch };
  }
  
  // For Monaco
  if (window.monacoEditor) {
    const position = window.monacoEditor.getPosition();
    return { line: position.lineNumber, column: position.column };
  }
  
  return null;
}
```

### For Scroll Position
```typescript
function getScrollPosition() {
  const scrollContainer = document.querySelector('.scroll-container');
  return scrollContainer?.scrollTop || 0;
}

function setScrollPosition(scrollTop) {
  const scrollContainer = document.querySelector('.scroll-container');
  if (scrollContainer) {
    scrollContainer.scrollTop = scrollTop;
  }
}
```

## Testing

To test the state preservation:

1. Open a prompt in panel mode
2. Make changes to the input/editor
3. Right-click and select "Convert to Window"
4. Verify that all state is preserved
5. Make more changes
6. Convert back to panel mode
7. Verify state is still preserved

## Notes

- State collection should be synchronous and fast
- Only collect state that makes sense to preserve
- Some state (like animations) should not be preserved
- The state object must be serializable (no functions, DOM nodes, etc.)
- Consider debouncing state updates if they happen frequently