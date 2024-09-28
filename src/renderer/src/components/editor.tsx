import { Channel, UI } from '@johnlindquist/kit/core/enum';
import type { EditorOptions } from '@johnlindquist/kit/types/kitapp';
import MonacoEditor, { type Monaco, useMonaco } from '@monaco-editor/react';

import log from 'electron-log';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import { useCallback, useEffect, useRef, useState } from 'react';

import { Range, type editor as monacoEditor } from 'monaco-editor/esm/vs/editor/editor.api';

const { ipcRenderer } = window.electron;
import {
  appConfigAtom,
  channelAtom,
  darkAtom,
  editorAppendAtom,
  editorConfigAtom,
  editorCursorPosAtom,
  editorOptions,
  editorSuggestionsAtom,
  flaggedChoiceValueAtom,
  inputAtom,
  openAtom,
  scrollToAtom,
  sendShortcutAtom,
  setFlagByShortcutAtom,
  shortcutStringsAtom,
  submitInputAtom,
  uiAtom,
} from '../jotai';

import { convertStringShortcutToMoncacoNumber } from '@renderer/utils/keycodes';
import { kitLight, nightOwl } from '../editor-themes';

const registerPropertiesLanguage = (monaco: Monaco) => {
  monaco.languages.register({ id: 'properties' });

  // Register a tokens provider for the language
  monaco.languages.setMonarchTokensProvider('properties', {
    tokenizer: {
      root: [
        [/^\#.*/, 'comment'],
        [/.*\=/, 'key'],
        [/^=.*/, 'value'],
      ],
    },
  });

  // Define a new theme that constains only rules that match this language
  monaco.editor.defineTheme('properties', {
    base: 'vs',
    inherit: false,
    rules: [
      { token: 'key', foreground: '009968' },
      { token: 'value', foreground: '009968' },
      { token: 'comment', foreground: '666666' },
    ],
  } as any);

  // Register a comment rule that will let us have comments in properties files
  monaco.languages.setLanguageConfiguration('properties', {
    comments: {
      lineComment: '#',
      blockComment: ['<#', '#>'],
    },
  });

  // Register a completion item provider for the new language
  monaco.languages.registerCompletionItemProvider('properties', {
    provideCompletionItems: () => [
      {
        label: 'simpleText',
        kind: monaco.languages.CompletionItemKind.Text,
      },
      {
        label: 'testing',
        kind: monaco.languages.CompletionItemKind.Keyword,
        insertText: {
          value: 'testing(${1:condition})',
        },
      },
      {
        label: 'ifelse',
        kind: monaco.languages.CompletionItemKind.Snippet,
        insertText: {
          value: ['if (${1:condition}) {', '\t$0', '} else {', '\t', '}'].join('\n'),
        },
        documentation: 'If-Else Statement',
      },
    ],
  } as any);
};

export default function Editor() {
  const [config] = useAtom(editorConfigAtom);
  const [kitIsDark] = useAtom(darkAtom);
  const [open] = useAtom(openAtom);
  const [, setInputValue] = useAtom(inputAtom);
  const [inputValue] = useAtom(inputAtom);
  const setCursorPosition = useSetAtom(editorCursorPosAtom);
  const [ui] = useAtom(uiAtom);
  const [options] = useAtom(editorOptions);
  const [editorSuggestions] = useAtom(editorSuggestionsAtom);
  const editorAppend = useAtomValue(editorAppendAtom);
  const disposeRef = useRef<any>(null);
  const [scrollTo, setScrollTo] = useAtom(scrollToAtom);
  const [channel] = useAtom(channelAtom);
  const [flaggedChoiceValue, setFlaggedChoiceValue] = useAtom(flaggedChoiceValueAtom);

  const m = useMonaco();

  // useSave(inputValue);
  // useClose();
  // useEscape();
  // useOpen();

  useEffect(() => {
    if (!m) {
      return;
    }

    if (disposeRef?.current) {
      disposeRef?.current?.dispose();
    }
    if (options?.language === 'markdown' || options?.language === 'md') {
      // eslint-disable-next-line react-hooks/exhaustive-deps
      disposeRef.current = m.languages.registerCompletionItemProvider('markdown', {
        async provideCompletionItems(model, position) {
          // clear previous suggestions

          const suggestions = editorSuggestions?.map((str: string) => ({
            label: str,
            insertText: str,
          }));

          return {
            suggestions,
          };
        },
      });
    }
  }, [editorSuggestions, m, options]);

  const [editor, setEditorRef] = useState<monacoEditor.IStandaloneCodeEditor | null>(null);

  useEffect(() => {
    if (editorSuggestions.length && options.language === 'markdown') {
      editor?.getAction('editor.action.triggerSuggest')?.run();
    }
  }, [editorSuggestions, editor, options]);

  const containerRef = useRef<HTMLDivElement>(null);

  const onBeforeMount = useCallback(
    (monaco: Monaco) => {
      monaco.editor.defineTheme('kit-dark', nightOwl);
      monaco.editor.defineTheme('kit-light', kitLight);

      monaco.languages.register({ id: 'vs.editor.nullLanguage' });
      monaco.languages.setLanguageConfiguration('vs.editor.nullLanguage', {});

      if (options?.language === 'properties') {
        registerPropertiesLanguage(monaco);
      }

      if (options?.language === 'typescript') {
        monaco.languages.typescript.typescriptDefaults.setDiagnosticsOptions({
          noSyntaxValidation: false,
          noSemanticValidation: false,
        });

        monaco.languages.typescript.typescriptDefaults.setCompilerOptions({
          target: monaco.languages.typescript.ScriptTarget.ESNext,
          allowNonTsExtensions: true,
          moduleResolution: monaco.languages.typescript.ModuleResolutionKind.NodeJs,
          module: monaco.languages.typescript.ModuleKind.ESNext,
          lib: ['esnext'],
          jsx: monaco.languages.typescript.JsxEmit.React,
          reactNamespace: 'React',
          typeRoots: ['node_modules/@types'],
        });
      }

      if (options?.language === 'javascript') {
        monaco.languages.typescript.javascriptDefaults.setDiagnosticsOptions({
          noSyntaxValidation: false,
          noSemanticValidation: true,
        });

        monaco.languages.typescript.javascriptDefaults.setCompilerOptions({
          target: monaco.languages.typescript.ScriptTarget.ESNext,
          allowNonTsExtensions: true,
          moduleResolution: monaco.languages.typescript.ModuleResolutionKind.NodeJs,
          module: monaco.languages.typescript.ModuleKind.ESNext,
          lib: ['esnext'],
          jsx: monaco.languages.typescript.JsxEmit.React,
          reactNamespace: 'React',
          typeRoots: ['node_modules/@types'],
        });
      }
    },
    [options],
  );

  const onMount = useCallback(
    (mountEditor: monacoEditor.IStandaloneCodeEditor, monaco: Monaco) => {
      setEditorRef(mountEditor);

      // Remove the cmd/control + k binding
      mountEditor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyK, () => {
        const value = mountEditor.getModel()?.getValue();
        setFlaggedChoiceValue(value || ui);
      });

      mountEditor.focus();

      // monaco.languages.typescript.typescriptDefaults.addExtraLib(
      //   `
      //   declare module 'axios' {
      //       export interface Foo {
      //           foo: string;
      //       }
      //   }
      //   `
      // );

      if (typeof config !== 'string') {
        if (config?.language === 'typescript') {
          if (config?.extraLibs?.length) {
            for (const { content, filePath } of config.extraLibs) {
              // console.log(filePath);
              // console.log(content);

              try {
                monaco.languages.typescript.typescriptDefaults.addExtraLib(content, filePath);
              } catch (e) {
                log.error({
                  error: e,
                  filePath,
                });
              }
            }
          }
        }

        if (config?.language === 'javascript') {
          if (config?.extraLibs?.length) {
            for (const { content, filePath } of config.extraLibs) {
              try {
                monaco.languages.typescript.javascriptDefaults.addExtraLib(content, filePath);
              } catch (e) {
                log.error({
                  error: e,
                  filePath,
                });
              }
            }
          }
        }
      }

      // const model = monaco.editor.createModel(
      //   `
      // import { getUserProfile } from './user';
      // const profile = getUserProfile("some-id");
      // console.log(profile.firstName);
      //     `.trim(),
      //   'typescript',
      //   monaco.Uri.parse('file:///main.tsx')
      // );

      // editor.setModel(model);

      monaco.editor.setTheme(kitIsDark ? 'kit-dark' : 'kit-light');

      mountEditor.layout({
        width: containerRef?.current?.offsetWidth || document.body.offsetWidth,
        height: (containerRef?.current?.offsetHeight || document.body.offsetHeight) - 24,
      });

      // if (typeof global?.exports === 'undefined') global.exports = {};
      mountEditor.focus();

      if (mountEditor?.getDomNode()) {
        ((mountEditor.getDomNode() as HTMLElement).style as any).webkitAppRegion = 'no-drag';
      }

      const lineNumber = mountEditor.getModel()?.getLineCount() || 0;

      if ((config as EditorOptions).scrollTo === 'bottom') {
        const column = (mountEditor?.getModel()?.getLineContent(lineNumber).length || 0) + 1;

        const position = { lineNumber, column };
        // console.log({ position });
        mountEditor.setPosition(position);

        mountEditor.revealPosition(position);
      }

      if ((config as EditorOptions).scrollTo === 'center') {
        mountEditor.revealLineInCenter(Math.floor(lineNumber / 2));
      }
    },
    [config, containerRef, kitIsDark],
  );

  const onChange = useCallback(
    (value) => {
      if (!editor) {
        return;
      }
      if (!editor?.getModel()) {
        return;
      }
      if (!editor?.getPosition()) {
        return;
      }
      setCursorPosition(editor?.getModel()?.getOffsetAt(editor.getPosition() || { lineNumber: 1, column: 1 }) || 0);
      setInputValue(value);
    },
    [editor, setCursorPosition, setInputValue],
  );

  // When inputValue changes, respect scrollTo bottom
  // Why did I want inputValue to always scrollTo bottom??? I don't remember... :/ Turning it off for now
  // This was for appending text programmatically!
  // TODO: Add "autoscroll" option?
  useEffect(() => {
    if (editor && (config as EditorOptions).scrollTo === 'bottom') {
      const lineNumber = editor.getModel()?.getLineCount() || 0;

      const column = (editor?.getModel()?.getLineContent(lineNumber).length || 0) + 1;

      const position = { lineNumber, column };
      editor.setPosition(position);

      editor.revealPosition(position);
    }
  }, [config, editor]);

  useEffect(() => {
    if (editor && scrollTo) {
      if (scrollTo === 'bottom') {
        const lineNumber = editor.getModel()?.getLineCount() || 0;

        const column = (editor?.getModel()?.getLineContent(lineNumber).length || 0) + 1;

        const position = { lineNumber, column };
        editor.setPosition(position);

        editor.revealPosition(position);
      }

      if (scrollTo === 'center') {
        const lineNumber = editor.getModel()?.getLineCount() || 0;
        editor.revealLineInCenter(Math.floor(lineNumber / 2));
      }

      if (scrollTo === 'top') {
        editor.setScrollPosition({ scrollTop: 0 });
      }

      setScrollTo(null);
    }
  }, [editor, scrollTo, setScrollTo]);

  useEffect(() => {
    if (ui === UI.editor && open && editor) {
      const lineNumber = editor.getModel()?.getLineCount() || 0;

      if ((config as EditorOptions).scrollTo === 'bottom') {
        const column = (editor?.getModel()?.getLineContent(lineNumber).length || 0) + 1;

        const position = { lineNumber, column };
        editor.setPosition(position);

        editor.revealPosition(position);
      }

      if ((config as EditorOptions).scrollTo === 'center') {
        editor.revealLineInCenter(Math.floor(lineNumber / 2));
      }

      if (config?.template) {
        const contribution = editor.getContribution('snippetController2');
        if (contribution) {
          (contribution as any).insert(config.template);
        }
      }

      editor.focus();
    }
  }, [open, config, editor, ui]);

  let prevAppendDate;
  useEffect(() => {
    if (editor && editorAppend?.text && prevAppendDate !== editorAppend?.date) {
      // set position to the end of the file
      const lineNumber = editor.getModel()?.getLineCount() || 0;
      const column = editor.getModel()?.getLineMaxColumn(lineNumber) || 0;
      const range = new Range(lineNumber, column, lineNumber, column);

      const id = { major: 1, minor: 1 };
      const op = {
        identifier: id,
        range,
        text: editorAppend?.text,
        forceMoveMarkers: true,
      };

      log.info('Appending text to editor', { text: editorAppend?.text });
      editor.executeEdits('my-source', [op]);

      // if cursor is at the end of the file, scroll to bottom
      const cursorPosition = editor.getPosition();
      if (cursorPosition?.lineNumber === lineNumber) {
        editor.revealLine(lineNumber + 1);
      }

      channel(Channel.APPEND_EDITOR_VALUE);
      prevAppendDate = editorAppend?.date;
    }
  }, [editor, editorAppend]);

  useEffect(() => {
    const getSelectedText = () => {
      if (!editor) {
        return;
      }
      const selection = editor.getSelection();

      if (!selection) {
        return;
      }
      const text = editor.getModel()?.getValueInRange(selection);
      // get the start and end of the selection
      const start = editor.getModel()?.getOffsetAt(selection.getStartPosition());
      const end = editor.getModel()?.getOffsetAt(selection.getEndPosition());

      channel(Channel.EDITOR_GET_SELECTION, {
        value: {
          text,
          start,
          end,
        },
      });
    };

    ipcRenderer.on(Channel.EDITOR_GET_SELECTION, getSelectedText);

    const getCursorPosition = () => {
      if (!editor) {
        return;
      }
      if (!editor?.getModel()) {
        return;
      }
      if (!editor?.getPosition()) {
        return;
      }

      // get the index of the cursor relative to the content
      const cursorOffset = editor?.getModel()?.getOffsetAt(editor.getPosition() || { lineNumber: 1, column: 1 }) || 0;

      channel(Channel.EDITOR_GET_CURSOR_OFFSET, { value: cursorOffset });
    };

    ipcRenderer.on(Channel.EDITOR_GET_CURSOR_OFFSET, getCursorPosition);

    const insertTextAtCursor = (event: any, text: string) => {
      if (!editor) {
        return;
      }
      if (!editor?.getModel()) {
        return;
      }
      if (!editor?.getPosition()) {
        return;
      }

      const cursorOffset = editor?.getModel()?.getOffsetAt(editor.getPosition() || { lineNumber: 1, column: 1 }) || 0;

      const position = editor.getModel()?.getPositionAt(cursorOffset);
      editor.setPosition(position || { lineNumber: 1, column: 1 });

      const id = { major: 1, minor: 1 };
      const op = {
        identifier: id,
        range: new Range(
          position?.lineNumber || 1,
          position?.column || 1,
          position?.lineNumber || 1,
          position?.column || 1,
        ),
        text,
        forceMoveMarkers: true,
      };

      editor.executeEdits('my-source', [op]);

      const newCursorOffset =
        editor?.getModel()?.getOffsetAt(editor.getPosition() || { lineNumber: 1, column: 1 }) || 0;

      channel(Channel.EDITOR_INSERT_TEXT, { value: newCursorOffset });
    };

    ipcRenderer.on(Channel.EDITOR_INSERT_TEXT, insertTextAtCursor);

    const moveCursor = (event: any, offset: number) => {
      if (!editor) {
        return;
      }
      if (!editor?.getModel()) {
        return;
      }

      const position = editor.getModel()?.getPositionAt(offset);
      editor.setPosition(position || { lineNumber: 1, column: 1 });

      const newCursorOffset =
        editor?.getModel()?.getOffsetAt(editor.getPosition() || { lineNumber: 1, column: 1 }) || 0;

      channel(Channel.EDITOR_MOVE_CURSOR, { value: newCursorOffset });
    };

    ipcRenderer.on(Channel.EDITOR_MOVE_CURSOR, moveCursor);

    return () => {
      ipcRenderer.removeListener(Channel.EDITOR_GET_SELECTION, getSelectedText);
      ipcRenderer.removeListener(Channel.EDITOR_GET_CURSOR_OFFSET, getCursorPosition);
      ipcRenderer.removeListener(Channel.EDITOR_INSERT_TEXT, insertTextAtCursor);
      ipcRenderer.removeListener(Channel.EDITOR_MOVE_CURSOR, moveCursor);
    };
  }, [editor]);

  const shortcutStrings = useAtomValue(shortcutStringsAtom);
  const appConfig = useAtomValue(appConfigAtom);
  const sendShortcut = useSetAtom(sendShortcutAtom);
  const setFlagByShortcut = useSetAtom(setFlagByShortcutAtom);
  const submitInput = useSetAtom(submitInputAtom);

  useEffect(() => {
    if (appConfig) {
      for (const { type, value } of shortcutStrings) {
        // log.info(`Assigning shortcut`, { type, value });
        const result = convertStringShortcutToMoncacoNumber(value, appConfig?.isWin);

        if (result) {
          editor?.addCommand(result, () => {
            log.info('🏆', { value, type });
            if (type === 'shortcut') {
              sendShortcut(value);
              return;
            }
            if (type === 'flag') {
              setFlagByShortcut(value);
              submitInput();
              return;
            }

            if (type === 'action') {
              setFlagByShortcut(value);
              submitInput();
              return;
            }
          });
        }
      }
    }
  }, [editor, shortcutStrings, appConfig]);

  const theme = kitIsDark ? 'kit-dark' : 'kit-light';

  return (
    <div
      id={UI.editor}
      key="editor"
      ref={containerRef}
      className={`
measure-my-height
      -mb-3 h-full
    w-full pt-3`}
    >
      <MonacoEditor
        className="h-full w-full"
        beforeMount={onBeforeMount}
        onMount={onMount}
        language={(config as EditorOptions)?.language || 'markdown'}
        theme={theme}
        options={options}
        path="file:///index.ts"
        value={inputValue}
        onChange={onChange}
      />
    </div>
  );
}
