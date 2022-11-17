/* eslint-disable no-template-curly-in-string */
/* eslint-disable no-useless-escape */
import React, { useCallback, useEffect, useState } from 'react';
import { useAtom, useAtomValue } from 'jotai';
import { motion } from 'framer-motion';
import MonacoEditor, { Monaco } from '@monaco-editor/react';

import { editor as monacoEditor, Range } from 'monaco-editor';
import { EditorOptions } from '@johnlindquist/kit/types/kitapp';
import { ipcRenderer } from 'electron';
import {
  cmdAtom,
  darkAtom,
  editorConfigAtom,
  editorOptions,
  editorThemeAtom,
  shortcutsAtom,
} from '../jotai';
import { useMountMainHeight } from '../hooks';
import { kitLight, nightOwl } from '../editor-themes';
import { WindowChannel } from '../enums';

const registerLogLanguage = (
  monaco: Monaco,
  theme: { foreground: string; background: string }
) => {
  monaco.languages.register({ id: 'log' });

  // Register a tokens provider for the language
  monaco.languages.setMonarchTokensProvider('log', {
    tokenizer: {
      root: [
        [/^.*info\]/, 'info'],
        [/^.*warn\]/, 'warn'],
        // [/^.*error\]/, 'error'],
        // [/^.*debug\]/, 'debug'],
        // [/^.*trace\]/, 'trace'],
        // [/^.*fatal\]/, 'fatal'],
      ],
    },
  });

  // Define a new theme that contains only rules that match this language
  monaco.editor.defineTheme('log-light', {
    base: 'vs',
    inherit: false,
    rules: [
      // info gray
      { token: 'info', foreground: '808080' },
      // warn yellow
      {
        token: 'warn',
        foreground: '0000ff',
        fontStyle: 'bold',
      },
      // // error red
      // { token: 'error', foreground: 'ff0000' },
      // // debug blue
      // { token: 'debug', foreground: '0000ff' },
      // // trace purple
      // { token: 'trace', foreground: '800080' },
      // // fatal red
      // { token: 'fatal', foreground: 'ff0000' },
    ],
    colors: {
      'editor.foreground': theme.foreground,
      'editor.background': theme.background,
    },
  });

  monaco.editor.defineTheme('log-dark', {
    base: 'vs-dark',
    inherit: false,
    rules: [
      { token: 'info', foreground: '808080' },
      { token: 'warn', foreground: 'ffff00' },
      // { token: 'error', foreground: 'ff0000', fontStyle: 'bold' },
      // { token: 'notice', foreground: 'FFA500' },
      // { token: 'debug', foreground: '008000' },
      // { token: 'date', foreground: '008800' },
    ],

    colors: {
      'editor.foreground': theme.foreground,
      'editor.background': theme.background,
    },
  });
};

export default function Log() {
  const [config] = useAtom(editorConfigAtom);
  const [isDark] = useAtom(darkAtom);
  const [options] = useAtom(editorOptions);
  const [logValue, setLogValue] = useState(``);
  const [mouseOver, setMouseOver] = useState(false);

  const theme = useAtomValue(editorThemeAtom);
  const [, setShortcuts] = useAtom(shortcutsAtom);
  const cmd = useAtomValue(cmdAtom);

  const [
    editor,
    setEditorRef,
  ] = useState<monacoEditor.IStandaloneCodeEditor | null>(null);

  const containerRef = useMountMainHeight();

  const onBeforeMount = useCallback(
    (monaco: Monaco) => {
      monaco.editor.defineTheme('kit-dark', nightOwl);
      monaco.editor.defineTheme('kit-light', kitLight);

      registerLogLanguage(monaco, theme);
    },
    [theme]
  );

  const onMount = useCallback(
    (mountEditor: monacoEditor.IStandaloneCodeEditor, monaco: Monaco) => {
      setEditorRef(mountEditor);

      // mountEditor.focus();

      monaco.editor.setTheme(isDark ? 'kit-dark' : 'kit-light');

      mountEditor.layout({
        width: containerRef?.current?.offsetWidth || document.body.offsetWidth,
        height:
          (containerRef?.current?.offsetHeight || document.body.offsetHeight) -
          24,
      });

      // if (typeof global?.exports === 'undefined') global.exports = {};
      // mountEditor.focus();

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

      ipcRenderer.send(WindowChannel.MOUNTED);
    },
    [config, containerRef, isDark]
  );

  useEffect(() => {
    if (editor) {
      ipcRenderer.on(WindowChannel.SET_LAST_LOG_LINE, (event, lastLogLine) => {
        // set position to the end of the file
        const lineNumber = editor.getModel()?.getLineCount() || 0;
        const range = new Range(lineNumber, 1, lineNumber, 1);

        const id = { major: 1, minor: 1 };
        const op = {
          identifier: id,
          range,
          text: `${lastLogLine}\n`,
          forceMoveMarkers: true,
        };

        editor.executeEdits('my-source', [op]);
        setLogValue(editor.getValue());
      });
    }
  }, [editor, setLogValue]);

  useEffect(() => {
    if (editor) {
      ipcRenderer.on(WindowChannel.SET_LOG_VALUE, (event, newLog) => {
        setLogValue(newLog);
        editor.setValue(newLog);

        console.log({ newLog });
      });
    }
  }, [editor]);

  useEffect(() => {
    if (!editor || mouseOver) return;
    editor.setScrollPosition({
      scrollTop: editor.getScrollHeight(),
    });
  }, [mouseOver, editor, logValue]);

  useEffect(() => {
    setShortcuts([
      {
        name: 'Clear Log',
        key: `${cmd}+l`,
        bar: 'right',
      },
    ]);
  }, [cmd, setShortcuts]);

  return (
    <motion.div
      onMouseEnter={() => setMouseOver(true)}
      onMouseLeave={() => setMouseOver(false)}
      key="editor"
      initial={{ opacity: 0 }}
      animate={{ opacity: [0, 1] }}
      transition={{ duration: 0.5, ease: 'circOut' }}
      ref={containerRef}
      className={`
    w-full h-full`}
    >
      <MonacoEditor
        className="w-full h-full"
        beforeMount={onBeforeMount}
        onMount={onMount}
        language="log"
        options={{
          ...options,
          fontSize: 14,
          scrollbar: { vertical: 'hidden' },
          language: 'log',
          theme: isDark ? 'log-dark' : 'log-light',
          minimap: { enabled: true },
        }}
        value={logValue}
        theme={isDark ? 'log-dark' : 'log-light'}
      />
    </motion.div>
  );
}
