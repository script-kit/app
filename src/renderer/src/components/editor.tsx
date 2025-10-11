import { Channel, UI } from '@johnlindquist/kit/core/enum';
import type { EditorOptions } from '@johnlindquist/kit/types/kitapp';
import MonacoEditor, { type Monaco, useMonaco } from '@monaco-editor/react';

import log from 'electron-log';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import { useCallback, useEffect, useRef, useState } from 'react';

import { Range, type editor as monacoEditor, type IDisposable } from 'monaco-editor/esm/vs/editor/editor.api';

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
  openActionsOverlayAtom,
  flagsAtom,
  inputAtom,
  openAtom,
  scrollToAtom,
  setFlagByShortcutAtom,
  submitInputAtom,
  uiAtom,
} from '../jotai';
import { triggerResizeAtom } from '../jotai';

import { toMonacoKeybindingOrUndefined, isReservedEditorShortcut } from '@renderer/utils/keycodes';
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
  
  // Log whenever inputValue changes
  useEffect(() => {
    console.log(JSON.stringify({
      source: 'EDITOR_inputValue_changed',
      valueLength: inputValue?.length || 0,
      valuePreview: inputValue?.substring(0, 50) || '',
      timestamp: Date.now()
    }));
  }, [inputValue]);
  const [ui] = useAtom(uiAtom);
  const [options] = useAtom(editorOptions);
  
  // Log editor options to check for readOnly or other restrictive settings
  useEffect(() => {
    console.log(JSON.stringify({
      source: 'EDITOR_OPTIONS',
      options,
      hasReadOnly: 'readOnly' in (options || {}),
      readOnlyValue: (options as any)?.readOnly
    }));
  }, [options]);
  const [editorSuggestions] = useAtom(editorSuggestionsAtom);
  const editorAppend = useAtomValue(editorAppendAtom);
  const disposeRef = useRef<any>(null);
  const [scrollTo, setScrollTo] = useAtom(scrollToAtom);
  const [channel] = useAtom(channelAtom);
  const openOverlay = useSetAtom(openActionsOverlayAtom);
  const triggerResize = useSetAtom(triggerResizeAtom);

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

      // Re-enable Cmd+K for Kit command palette (like the old working version)
      mountEditor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyK, () => {
        const value = mountEditor.getModel()?.getValue();
        openOverlay({ source: 'editor', flag: (value || ui) as any });
      });
      
      // TEMPORARY: Add explicit paste handler to work around the issue
      mountEditor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyV, async () => {
        console.log('[EDITOR] Cmd+V handler triggered');
        try {
          const text = await navigator.clipboard.readText();
          if (text) {
            const selection = mountEditor.getSelection();
            if (selection) {
              mountEditor.executeEdits('manual-paste', [{
                range: selection,
                text: text,
                forceMoveMarkers: true
              }]);
            }
          }
        } catch (err) {
          console.error('[EDITOR] Paste failed:', err);
        }
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

      // After initial layout, request a single EDITOR measurement to stabilize layout math
      triggerResize('EDITOR');

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
    [config, containerRef, kitIsDark, triggerResize],
  );

  const onChange = useCallback(
    (value) => {
      console.log(JSON.stringify({
        source: 'MONACO_onChange',
        valueLength: value?.length || 0,
        valuePreview: value?.substring(0, 50) || '',
        timestamp: Date.now()
      }));
      
      if (!editor) {
        console.warn('[MONACO_onChange] No editor, skipping setInputValue');
        return;
      }
      if (!editor?.getModel()) {
        console.warn('[MONACO_onChange] No model, skipping setInputValue');
        return;
      }
      if (!editor?.getPosition()) {
        console.warn('[MONACO_onChange] No position, skipping setInputValue');
        return;
      }
      
      console.log(JSON.stringify({
        source: 'MONACO_onChange_calling_setInputValue',
        valueLength: value?.length || 0,
        valuePreview: value?.substring(0, 50) || '',
        timestamp: Date.now()
      }));
      
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
    if (editor && editorAppend?.text !== undefined && prevAppendDate !== editorAppend?.date) {
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

    const replaceTextRange = (event: any, { start, end, text }: { start: number; end: number; text: string }) => {
      if (!editor || !editor.getModel()) return;
      
      const startPos = editor.getModel()!.getPositionAt(start);
      const endPos = editor.getModel()!.getPositionAt(end);
      
      const range = new Range(
        startPos.lineNumber, startPos.column,
        endPos.lineNumber, endPos.column
      );
      
      editor.executeEdits('replace-range', [{
        identifier: { major: 1, minor: 1 },
        range,
        text,
        forceMoveMarkers: true
      }]);
      
      channel(Channel.EDITOR_REPLACE_RANGE, { 
        value: editor.getModel()!.getOffsetAt(editor.getPosition()!) 
      });
    };

    ipcRenderer.on(Channel.EDITOR_REPLACE_RANGE, replaceTextRange);

    const getLineInfo = (event: any, lineNumber?: number) => {
      if (!editor || !editor.getModel()) return;
      
      const currentLine = lineNumber || editor.getPosition()?.lineNumber || 1;
      const lineContent = editor.getModel()!.getLineContent(currentLine);
      const lineLength = lineContent.length;
      const lineCount = editor.getModel()!.getLineCount();
      
      channel(Channel.EDITOR_GET_LINE_INFO, {
        value: {
          lineNumber: currentLine,
          content: lineContent,
          length: lineLength,
          totalLines: lineCount,
          indentation: lineContent.match(/^(\s*)/)?.[1] || ''
        }
      });
    };

    ipcRenderer.on(Channel.EDITOR_GET_LINE_INFO, getLineInfo);

    const findAndReplaceAll = (event: any, { searchText, replaceText, options }: { searchText: string; replaceText: string; options?: { regex?: boolean; matchCase?: boolean; wholeWord?: boolean } }) => {
      if (!editor || !editor.getModel()) return;
      
      const model = editor.getModel()!;
      const matches = model.findMatches(
        searchText, 
        false, // searchOnlyEditableRange
        options?.regex || false,
        options?.matchCase || false,
        options?.wholeWord || false,
        true // captureMatches
      );
      
      const edits = matches.map(match => ({
        identifier: { major: 1, minor: 1 },
        range: match.range,
        text: replaceText,
        forceMoveMarkers: true
      }));
      
      editor.executeEdits('find-replace-all', edits);
      
      channel(Channel.EDITOR_FIND_REPLACE_ALL, { 
        value: { replacedCount: matches.length } 
      });
    };

    ipcRenderer.on(Channel.EDITOR_FIND_REPLACE_ALL, findAndReplaceAll);

    const getFoldedRegions = () => {
      if (!editor) return;
      
      // Monaco doesn't expose folding state directly, so we'll return empty array for now
      // In a real implementation, you'd need to access internal folding model
      channel(Channel.EDITOR_GET_FOLDED_REGIONS, { 
        value: []
      });
    };

    ipcRenderer.on(Channel.EDITOR_GET_FOLDED_REGIONS, getFoldedRegions);

    const setFoldedRegions = (event: any, regions: Array<{ start: number; end: number }>) => {
      if (!editor) return;
      
      // First unfold all
      editor.getAction('editor.unfoldAll')?.run();
      
      // Then fold specified regions
      regions.forEach(region => {
        editor.setSelection(new Range(
          region.start, 1, 
          region.end, 1
        ));
        editor.getAction('editor.fold')?.run();
      });
      
      channel(Channel.EDITOR_SET_FOLDED_REGIONS);
    };

    ipcRenderer.on(Channel.EDITOR_SET_FOLDED_REGIONS, setFoldedRegions);

    const executeMonacoCommand = async (event: any, { commandId, args }: { commandId: string; args?: any }) => {
      if (!editor) return;
      
      try {
        const result = await editor.getAction(commandId)?.run(args);
        
        channel(Channel.EDITOR_EXECUTE_COMMAND, { 
          value: { 
            success: true, 
            commandId,
            result 
          } 
        });
      } catch (error: any) {
        channel(Channel.EDITOR_EXECUTE_COMMAND, { 
          value: { 
            success: false, 
            commandId,
            error: error.message 
          } 
        });
      }
    };

    ipcRenderer.on(Channel.EDITOR_EXECUTE_COMMAND, executeMonacoCommand);

    const scrollToPosition = (event: any, position: 'top' | 'center' | 'bottom' | number) => {
      if (!editor) return;
      
      if (typeof position === 'number') {
        editor.revealLineInCenter(position);
      } else if (position === 'top') {
        editor.setScrollPosition({ scrollTop: 0 });
      } else if (position === 'bottom') {
        const lineNumber = editor.getModel()?.getLineCount() || 0;
        const column = (editor?.getModel()?.getLineContent(lineNumber).length || 0) + 1;
        const pos = { lineNumber, column };
        editor.setPosition(pos);
        editor.revealPosition(pos);
      } else if (position === 'center') {
        const lineNumber = editor.getModel()?.getLineCount() || 0;
        editor.revealLineInCenter(Math.floor(lineNumber / 2));
      }
      
      channel(Channel.EDITOR_SCROLL_TO);
    };

    ipcRenderer.on(Channel.EDITOR_SCROLL_TO, scrollToPosition);

    const scrollToTop = () => {
      if (!editor) return;
      editor.revealLine(1);
      editor.setScrollPosition({ scrollTop: 0 });
      channel(Channel.EDITOR_SCROLL_TO_TOP);
    };

    ipcRenderer.on(Channel.EDITOR_SCROLL_TO_TOP, scrollToTop);

    const scrollToBottom = () => {
      if (!editor || !editor.getModel()) return;
      const model = editor.getModel();
      const lineNumber = model.getLineCount();
      if (lineNumber > 0) {
        const column = model.getLineMaxColumn(lineNumber);
        const position = { lineNumber, column };
        editor.setPosition(position);
        editor.revealPosition(position, 1); // 1 = ScrollType.Immediate
      }
      channel(Channel.EDITOR_SCROLL_TO_BOTTOM);
    };

    ipcRenderer.on(Channel.EDITOR_SCROLL_TO_BOTTOM, scrollToBottom);

    const getCurrentInput = () => {
      if (!editor || !editor.getModel()) return;
      
      const value = editor.getModel()!.getValue();
      channel(Channel.EDITOR_GET_CURRENT_INPUT, { value });
    };

    ipcRenderer.on(Channel.EDITOR_GET_CURRENT_INPUT, getCurrentInput);

    return () => {
      ipcRenderer.removeListener(Channel.EDITOR_GET_SELECTION, getSelectedText);
      ipcRenderer.removeListener(Channel.EDITOR_GET_CURSOR_OFFSET, getCursorPosition);
      ipcRenderer.removeListener(Channel.EDITOR_INSERT_TEXT, insertTextAtCursor);
      ipcRenderer.removeListener(Channel.EDITOR_MOVE_CURSOR, moveCursor);
      ipcRenderer.removeListener(Channel.EDITOR_REPLACE_RANGE, replaceTextRange);
      ipcRenderer.removeListener(Channel.EDITOR_GET_LINE_INFO, getLineInfo);
      ipcRenderer.removeListener(Channel.EDITOR_FIND_REPLACE_ALL, findAndReplaceAll);
      ipcRenderer.removeListener(Channel.EDITOR_GET_FOLDED_REGIONS, getFoldedRegions);
      ipcRenderer.removeListener(Channel.EDITOR_SET_FOLDED_REGIONS, setFoldedRegions);
      ipcRenderer.removeListener(Channel.EDITOR_EXECUTE_COMMAND, executeMonacoCommand);
      ipcRenderer.removeListener(Channel.EDITOR_SCROLL_TO, scrollToPosition);
      ipcRenderer.removeListener(Channel.EDITOR_SCROLL_TO_TOP, scrollToTop);
      ipcRenderer.removeListener(Channel.EDITOR_SCROLL_TO_BOTTOM, scrollToBottom);
      ipcRenderer.removeListener(Channel.EDITOR_GET_CURRENT_INPUT, getCurrentInput);
    };
  }, [editor, channel]);

  const appConfig = useAtomValue(appConfigAtom);
  const flags = useAtomValue(flagsAtom);
  const setFlagByShortcut = useSetAtom(setFlagByShortcutAtom);
  const submitInput = useSetAtom(submitInputAtom);

  // Track command IDs for cleanup
  const commandIdsRef = useRef<string[]>([]);

  useEffect(() => {
    console.log(JSON.stringify({
      source: 'EDITOR_KEYBINDINGS_useEffect',
      hasAppConfig: !!appConfig,
      hasEditor: !!editor,
      hasFlags: !!flags,
      flagCount: flags ? Object.keys(flags).length : 0,
      flags: flags ? Object.entries(flags).map(([k, v]) => ({ 
        key: k, 
        shortcut: (v as any)?.shortcut,
        hasAction: (v as any)?.hasAction
      })) : []
    }));

    if (appConfig && editor && flags) {
      // Clean up previous commands
      commandIdsRef.current.forEach(id => {
        console.log('[EDITOR KEYBINDINGS] Cleaning up command:', id);
      });
      commandIdsRef.current = [];

      const disposables: IDisposable[] = [];
      const isWindows = appConfig?.isWin || false;

      console.log('[EDITOR KEYBINDINGS] Starting registration for flags');

      // ONLY register shortcuts that are defined in the current prompt's flags
      Object.entries(flags).forEach(([flagKey, flag]) => {
        const flagData = flag as any;
        console.log(JSON.stringify({
          source: 'EDITOR_KEYBINDINGS_processing_flag',
          flagKey,
          shortcut: flagData?.shortcut,
          name: flagData?.name,
          hasAction: flagData?.hasAction
        }));

        if (flagData?.shortcut) {
          // CRITICAL: Skip reserved editor shortcuts (clipboard, undo, etc.)
          if (isReservedEditorShortcut(flagData.shortcut, true)) {
            console.warn(JSON.stringify({
              source: 'EDITOR_KEYBINDINGS_SKIP_RESERVED',
              shortcut: flagData.shortcut,
              reason: 'Reserved editor shortcut (clipboard/edit/find operation)'
            }));
            return; // Skip this flag entirely
          }
          
          // Use the safe converter that returns undefined for invalid keybindings
          const keybinding = toMonacoKeybindingOrUndefined(flagData.shortcut, isWindows);
          
          console.log('[EDITOR KEYBINDINGS] Converted shortcut:', {
            shortcut: flagData.shortcut,
            keybinding,
            keybindingBinary: keybinding ? keybinding.toString(2) : 'undefined',
            keybindingHex: keybinding ? '0x' + keybinding.toString(16) : 'undefined',
            keyCode: keybinding ? (keybinding & 0xFF) : 'N/A',
            isValid: keybinding !== undefined
          });

          // Skip if the keybinding couldn't be resolved or would be modifier-only
          if (keybinding === undefined) {
            console.warn('[EDITOR KEYBINDINGS] Skipping invalid shortcut:', flagData.shortcut);
            return;
          }

          // Use addAction for proper disposal support
          const actionId = `kit.flag.${flagKey}`;
          console.log('[EDITOR KEYBINDINGS] Registering action:', {
            actionId,
            label: flagData.name || flagKey,
            keybinding,
            precondition: 'editorTextFocus && !suggestWidgetVisible && !findWidgetVisible && !renameInputVisible'
          });

          try {
            // Use simpler addCommand like the working version did
            const commandId = editor.addCommand(keybinding, () => {
              console.log('[EDITOR COMMAND] Triggered!', {
                shortcut: flagData.shortcut,
                flag: flagKey,
                timestamp: Date.now()
              });

              // setFlagByShortcut will handle setting either focusedActionAtom (for actions with onAction)
              // or flaggedChoiceValueAtom/focusedFlagValueAtom (for normal flags)
              setFlagByShortcut(flagData.shortcut);
              // Always submit - the submitValueAtom will check if it's an action with hasAction
              submitInput();
            });

            console.log('[EDITOR KEYBINDINGS] Successfully registered command:', actionId, 'commandId:', commandId);
            if (commandId) {
              const editorAny = editor as any;

              const disposeCommand = () => {
                try {
                  if (typeof editorAny.removeCommand === 'function') {
                    editorAny.removeCommand(commandId);
                    return;
                  }

                  const keybindingService = editorAny?._standaloneKeybindingService;
                  if (keybindingService?.removeDynamicKeybinding) {
                    keybindingService.removeDynamicKeybinding(commandId);
                  }
                } catch (disposeError) {
                  console.error('[EDITOR KEYBINDINGS] Failed to dispose command:', {
                    commandId,
                    error: disposeError instanceof Error ? disposeError.message : disposeError,
                  });
                }
              };

              disposables.push({ dispose: disposeCommand });
            }
            commandIdsRef.current.push(actionId);
          } catch (error) {
            console.error('[EDITOR KEYBINDINGS] Failed to register action:', {
              actionId,
              error: error instanceof Error ? error.message : error
            });
          }
        }
      });

      console.log('[EDITOR KEYBINDINGS] Registration complete:', {
        registeredCount: disposables.length,
        registeredIds: commandIdsRef.current
      });

      // Cleanup function
      return () => {
        console.log('[EDITOR KEYBINDINGS] Cleanup - disposing', disposables.length, 'actions');
        disposables.forEach(d => {
          try {
            d.dispose();
          } catch (e) {
            console.error('[EDITOR KEYBINDINGS] Error disposing action:', e);
          }
        });
      };
    }
  }, [editor, appConfig, flags, setFlagByShortcut, submitInput]);

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
