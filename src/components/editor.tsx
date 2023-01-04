/* eslint-disable no-template-curly-in-string */
/* eslint-disable no-useless-escape */

import { useCallback, useEffect, useRef, useState, memo } from 'react';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import { motion } from 'framer-motion';
import MonacoEditor, { Monaco, useMonaco } from '@monaco-editor/react';
import { editor as monacoEditor, Range } from 'monaco-editor';
import { UI } from '@johnlindquist/kit/core/enum';
import { EditorOptions } from '@johnlindquist/kit/types/kitapp';
import {
  darkAtom,
  editorAppendAtom,
  editorConfigAtom,
  editorCursorPosAtom,
  editorOptions,
  editorSuggestionsAtom,
  inputAtom,
  openAtom,
  uiAtom,
} from '../jotai';
import { useMountMainHeight } from '../hooks';
import {
  registerPropertiesLanguage,
  setupMarkdownAutocomplete,
  setupTypeScript,
  setupJavaScript,
} from '../monaco/utils';

import Boundary from '../boundary';

export default memo(function Editor() {
  const [config] = useAtom(editorConfigAtom);
  const [kitIsDark] = useAtom(darkAtom);
  const [open] = useAtom(openAtom);
  const [inputValue, setInputValue] = useAtom(inputAtom);
  const setCursorPosition = useSetAtom(editorCursorPosAtom);
  const [ui] = useAtom(uiAtom);
  const [options] = useAtom(editorOptions);
  const [editorSuggestions] = useAtom(editorSuggestionsAtom);
  const editorAppend = useAtomValue(editorAppendAtom);
  const disposeRef = useRef<any>(null);

  const monaco = useMonaco();

  useEffect(() => {
    if (!monaco) return;

    if (disposeRef?.current) disposeRef?.current?.dispose();
    if (options?.language === 'markdown' || options?.language === 'md') {
      // eslint-disable-next-line react-hooks/exhaustive-deps
      disposeRef.current = setupMarkdownAutocomplete(monaco);
    }
  }, [editorSuggestions, monaco, options]);

  const [
    editor,
    setEditorRef,
  ] = useState<monacoEditor.IStandaloneCodeEditor | null>(null);

  useEffect(() => {
    if (editorSuggestions.length && options.language === 'markdown') {
      editor?.getAction('editor.action.triggerSuggest')?.run();
    }
  }, [editorSuggestions, editor, options]);

  const containerRef = useMountMainHeight();

  const onBeforeMount = useCallback(
    (monaco: Monaco) => {
      if (options?.language === 'properties') {
        registerPropertiesLanguage(monaco);
      }

      if (options?.language === 'typescript') {
        setupTypeScript(monaco);
      }

      if (options?.language === 'javascript') {
        setupJavaScript(monaco);
      }
    },
    [options]
  );

  const onMount = useCallback(
    (mountEditor: monacoEditor.IStandaloneCodeEditor, monaco: Monaco) => {
      setEditorRef(mountEditor);

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
              monaco.languages.typescript.typescriptDefaults.addExtraLib(
                content,
                filePath
              );
            }
          }
        }

        if (config?.language === 'javascript') {
          if (config?.extraLibs?.length) {
            for (const { content, filePath } of config.extraLibs) {
              monaco.languages.typescript.javascriptDefaults.addExtraLib(
                content,
                filePath
              );
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
        height:
          (containerRef?.current?.offsetHeight || document.body.offsetHeight) -
          24,
      });

      // if (typeof global?.exports === 'undefined') global.exports = {};
      mountEditor.focus();

      if (mountEditor?.getDomNode())
        ((mountEditor.getDomNode() as HTMLElement)
          .style as any).webkitAppRegion = 'no-drag';

      const lineNumber = mountEditor.getModel()?.getLineCount() || 0;

      if ((config as EditorOptions).scrollTo === 'bottom') {
        const column =
          (mountEditor?.getModel()?.getLineContent(lineNumber).length || 0) + 1;

        const position = { lineNumber, column };
        // console.log({ position });
        mountEditor.setPosition(position);

        mountEditor.revealPosition(position);
      }

      if ((config as EditorOptions).scrollTo === 'center') {
        mountEditor.revealLineInCenter(Math.floor(lineNumber / 2));
      }
    },
    [config, containerRef, kitIsDark]
  );

  const onChange = useCallback(
    (value) => {
      if (!editor) return;
      if (!editor?.getModel()) return;
      if (!editor?.getPosition()) return;
      setCursorPosition(
        editor
          ?.getModel()
          ?.getOffsetAt(editor.getPosition() || { lineNumber: 1, column: 1 }) ||
          0
      );
      setInputValue(value);
    },
    [editor, setCursorPosition, setInputValue]
  );

  useEffect(() => {
    if (ui === UI.editor && open && editor) {
      const lineNumber = editor.getModel()?.getLineCount() || 0;

      if ((config as EditorOptions).scrollTo === 'bottom') {
        const column =
          (editor?.getModel()?.getLineContent(lineNumber).length || 0) + 1;

        const position = { lineNumber, column };
        editor.setPosition(position);

        editor.revealPosition(position);
      }

      if ((config as EditorOptions).scrollTo === 'center') {
        editor.revealLineInCenter(Math.floor(lineNumber / 2));
      }

      if ((config as any)?.template) {
        const contribution = editor.getContribution('snippetController2');
        if (contribution && config) {
          (contribution as any).insert((config as any).template as any);
        }
      }

      editor.focus();
    }
  }, [open, config, editor, ui]);

  useEffect(() => {
    if (editor && editorAppend) {
      // set position to the end of the file
      const lineNumber = editor.getModel()?.getLineCount() || 0;
      const column = editor.getModel()?.getLineMaxColumn(lineNumber) || 0;
      const range = new Range(lineNumber, column, lineNumber, column);

      const id = { major: 1, minor: 1 };
      const op = {
        identifier: id,
        range,
        text: editorAppend,
        forceMoveMarkers: true,
      };

      editor.executeEdits('my-source', [op]);
      // scroll to bottom
      editor.revealLine(lineNumber + 1);
    }
  }, [editor, editorAppend]);

  const theme = kitIsDark ? 'kit-dark' : 'kit-light';

  return (
    <motion.div
      key="editor"
      initial={{ opacity: 0 }}
      animate={{ opacity: [0, 1] }}
      transition={{ duration: 0.1, ease: 'circOut' }}
      ref={containerRef}
      className={`
      pt-3 -mb-3
    w-full h-full`}
    >
      <Boundary>
        <MonacoEditor
          className="w-full h-full"
          beforeMount={onBeforeMount}
          onMount={onMount}
          language={(config as EditorOptions)?.language || 'markdown'}
          theme={theme}
          options={options}
          path="file:///index.ts"
          value={inputValue}
          onChange={onChange}
        />
      </Boundary>
    </motion.div>
  );
});
