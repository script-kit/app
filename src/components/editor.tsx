import React, { useCallback, useRef } from 'react';
import path from 'path';
import { useAtom } from 'jotai';
import MonacoEditor, { loader } from '@monaco-editor/react';
import { editor } from 'monaco-editor';
import { EditorOptions } from 'kit-bridge/cjs/type';
import { useClose, useFocus, useSave, useThemeDetector } from '../hooks';
import { editorConfigAtom } from '../jotai';
import useMountHeight from './hooks/useMountHeight';

function ensureFirstBackSlash(str: string) {
  return str.length > 0 && str.charAt(0) !== '/' ? `/${str}` : str;
}

function uriFromPath(_path: string) {
  const pathName = path.resolve(_path).replace(/\\/g, '/');
  return encodeURI(`file://${ensureFirstBackSlash(pathName)}`);
}

loader.config({
  paths: {
    vs: uriFromPath(path.join(__dirname, '../assets/vs')),
  },
});

const DEFAULT_OPTIONS: editor.IStandaloneEditorConstructionOptions = {
  fontFamily: 'JetBrains Mono',
  fontSize: 18,
  minimap: {
    enabled: false,
  },
  wordWrap: 'on',
};

export default function Editor() {
  const editorRef = useRef<editor.IStandaloneCodeEditor>();

  const [options] = useAtom(editorConfigAtom);

  useSave(() => editorRef.current?.getValue());
  useClose();

  const isDark = useThemeDetector();
  const containerRef = useMountHeight();

  const beforeMount = useCallback((monaco) => {
    monaco.editor.defineTheme('kit-dark', {
      base: 'vs-dark',
      inherit: true,
      rules: [],
      colors: {
        'editor.background': '#00000000',
      },
    });
    monaco.editor.defineTheme('kit-light', {
      base: 'vs',
      inherit: true,
      rules: [],
      colors: {
        'editor.background': '#FFFFFF00',
      },
    });
  }, []);
  const onMount = useCallback(
    (editorInstance: editor.IStandaloneCodeEditor) => {
      editorInstance.focus();
      editorRef.current = editorInstance;

      if (editorInstance?.getDomNode())
        (
          (editorInstance.getDomNode() as HTMLElement).style as any
        ).webkitAppRegion = 'no-drag';

      const lineNumber = editorInstance.getModel()?.getLineCount() || 0;
      if ((options as EditorOptions).scrollTo === 'bottom') {
        const column =
          (editorInstance?.getModel()?.getLineContent(lineNumber).length || 0) +
          1;
        editorInstance.setPosition({ lineNumber, column });
        if (lineNumber > 5) {
          editorInstance.revealLineInCenter(lineNumber - 3);
        }
      }

      if ((options as EditorOptions).scrollTo === 'center') {
        editorInstance.revealLineInCenter(Math.floor(lineNumber / 2));
      }
    },
    [options]
  );

  return (
    <div
      ref={containerRef}
      className={`
    pt-3
    w-full h-full min-h-64`}
    >
      <MonacoEditor
        beforeMount={beforeMount}
        onMount={onMount}
        language={(options as EditorOptions)?.language || 'markdown'}
        theme={isDark ? 'kit-dark' : 'kit-light'}
        options={{ ...DEFAULT_OPTIONS, ...(options as EditorOptions) }}
        value={(options as EditorOptions)?.value || ''}
      />
    </div>
  );
}
