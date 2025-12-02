/**
 * Log state atoms.
 * Manages application logs and console output display.
 */

import { Channel } from '@johnlindquist/kit/core/enum';
import Convert from 'ansi-to-html';
import { atom } from 'jotai';
import { drop as _drop } from 'lodash-es';

const MAX_LOG_LINES = 3000;

// --- Log Lines ---
const _logLinesAtom = atom<string[]>([]);
export const logLinesAtom = atom(
  (g) => g(_logLinesAtom),
  (_g, s, a: string[]) => {
    return s(_logLinesAtom, a);
  },
);

export const logHTMLAtom = atom<string>('');
export const editorLogModeAtom = atom(false);
export const lastLogLineAtom = atom<string>('');
export const logValueAtom = atom<string>('');

// --- Log Appending ---
export const appendToLogHTMLAtom = atom(null, (g, s, a: string) => {
  if (a === Channel.CONSOLE_CLEAR || a === '') {
    s(logLinesAtom, []);
    s(logHTMLAtom, '');
    return;
  }
  const oldLog = g(logLinesAtom);
  // Keep a maximum number of log lines, dropping the oldest if necessary
  const updatedLog = _drop(oldLog, oldLog.length > MAX_LOG_LINES ? oldLog.length - MAX_LOG_LINES : 0).concat([a]);
  s(logLinesAtom, updatedLog);
});

// --- ANSI to HTML Converter ---
export const convertAtom = atom<(inverse?: boolean) => Convert>(() => {
  return (inverse = false) => {
    // Will be properly implemented with theme dependency later
    const bg = inverse ? '#000' : '#fff';
    const fg = inverse ? '#fff' : '#000';

    const convertOptions: ConstructorParameters<typeof import('ansi-to-html')>[0] = {
      bg,
      fg,
      newline: true,
    };

    return new Convert(convertOptions);
  };
});
