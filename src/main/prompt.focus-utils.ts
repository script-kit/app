export function isDevToolsShortcut(input: { control?: boolean; meta?: boolean; shift?: boolean; key: string }) {
  return (
    ((input.control || input.meta) && input.shift && input.key.toLowerCase() === 'i') ||
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


