export function isDevToolsShortcut(input: {
  control?: boolean;
  meta?: boolean;
  shift?: boolean;
  alt?: boolean;
  key: string;
}) {
  // Mac: Cmd+Option+I (meta + alt + i)
  // Windows/Linux: Ctrl+Shift+I (control + shift + i) or F12
  return (
    (input.meta && input.alt && input.key.toLowerCase() === 'i') ||
    (input.control && input.shift && input.key.toLowerCase() === 'i') ||
    input.key === 'F12'
  );
}

export function computeShouldCloseOnInitialEscape(
  firstPrompt: boolean,
  isMainMenu: boolean,
  isEscape: boolean,
  wasActionsJustOpen: boolean,
) {
  return (firstPrompt || isMainMenu) && isEscape && !wasActionsJustOpen;
}
