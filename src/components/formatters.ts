export const formatShortcut = (shortcut = '') => {
  return shortcut
    .replace('cmd', '⌘')
    .replace('ctrl', '⌃')
    .replace('shift', '⇧')
    .replace('opt', '⌥')
    .replace('alt', '⌥')
    .replace('enter', '⏎')
    .replace('return', '⏎')
    .replace('escape', '⎋')
    .replace('up', '↑')
    .replace('down', '↓')
    .replace('left', '←')
    .replace('right', '→')
    .replace('delete', '⌫')
    .replace('backspace', '⌫')
    .replace('tab', '⇥')
    .replace('space', '␣')
    .replace('pageup', '⇞')
    .replace('pagedown', '⇟')
    .replace('home', '↖')
    .replace('end', '↘')
    .replace('capslock', '⇪')

    .toUpperCase();
};
