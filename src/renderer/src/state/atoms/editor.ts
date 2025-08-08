/**
 * Editor state atoms.
 * State specific to the Monaco editor component.
 */

import { atom } from 'jotai';
import type { editor } from 'monaco-editor';
import type { EditorConfig, EditorOptions } from '@johnlindquist/kit/types/kitapp';
import { findCssVar } from '../../../shared/color-utils';

const MAX_EDITOR_HISTORY = 30;

const defaultEditorOptions: editor.IStandaloneEditorConstructionOptions = {
  fontFamily: 'JetBrains Mono',
  fontSize: 15,
  minimap: { enabled: false },
  wordWrap: 'on',
  wrappingStrategy: 'advanced',
  lineNumbers: 'off',
  glyphMargin: false,
  scrollBeyondLastLine: false,
  quickSuggestions: true,
  formatOnType: true,
  selectionHighlight: false,
  roundedSelection: false,
  renderWhitespace: 'none',
  trimAutoWhitespace: true,
  renderLineHighlight: 'none',
  stickyScroll: { enabled: false },
};

export const editorOptions = atom<editor.IStandaloneEditorConstructionOptions>(defaultEditorOptions);

const editorConfig = atom<EditorConfig | null>({
  value: '',
  language: 'markdown',
  extraLibs: [],
} as EditorOptions);

export const editorConfigAtom = atom(
  (g) => g(editorConfig),
  (_g, s, a: EditorOptions) => {
    s(editorConfig, a);
    
    // Destructure to separate options for Monaco from other configurations
    const { file, scrollTo, hint: h, onInput, onEscape, onAbandon, onBlur, ignoreBlur, extraLibs, ...options } = a as any;
    
    s(editorOptions, {
      ...defaultEditorOptions,
      ...(options as editor.IStandaloneEditorConstructionOptions),
    });
  },
);

export const editorSuggestionsAtom = atom<string[]>([]);
export const editorCursorPosAtom = atom<number>(0);
export const editorValueAtom = atom<{ text: string; date: string; }>({ text: '', date: '' });

// Atom specifically for triggering an append action in the editor component
export const editorAppendAtom = atom(
  (g) => g(editorValueAtom),
  (_g, s, a: string) => {
    s(editorValueAtom, {
      text: a,
      date: new Date().toISOString(),
    });
  },
);

// --- Editor History ---
export const editorHistory = atom<{ content: string; timestamp: string }[]>([]);
export const editorHistoryPush = atom(null, (g, s, a: string) => {
  const history = g(editorHistory);
  const updatedHistory = [
    { content: a, timestamp: new Date().toISOString() },
    ...history,
  ];
  
  if (updatedHistory.length > MAX_EDITOR_HISTORY) {
    updatedHistory.length = MAX_EDITOR_HISTORY;
  }
  s(editorHistory, updatedHistory);
});

// --- Editor Theme ---
export const editorThemeAtom = atom<{ foreground: string; background: string }>((_g) => {
  return {
    foreground: findCssVar('--color-text'),
    background: findCssVar('--color-background'),
  };
});