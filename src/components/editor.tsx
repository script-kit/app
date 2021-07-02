import React, { forwardRef, useCallback, useEffect } from 'react';
import path from 'path';
import MonacoEditor, { loader } from '@monaco-editor/react';
import { editor } from 'monaco-editor';
import { useThemeDetector } from '../hooks';
import { EditorProps } from '../types';

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
  fontSize: 16,
  minimap: {
    enabled: false,
  },
  wordWrap: 'on',
};

export default forwardRef<any, any>(function Editor(
  { options, height, width }: EditorProps,
  ref: any
) {
  useEffect(() => {
    return () => {
      ref(null);
    };
  }, [ref]);

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
      ref(editorInstance);
      if (editorInstance?.getDomNode())
        (editorInstance.getDomNode() as HTMLElement).style.webkitAppRegion =
          'no-drag';

      const lineNumber = editorInstance.getModel()?.getLineCount() || 0;
      const column =
        (editorInstance?.getModel()?.getLineContent(lineNumber).length || 0) +
        1;
      editorInstance.setPosition({ lineNumber, column });
      if (lineNumber > 5) {
        editorInstance.revealLineInCenter(lineNumber - 3);
      }
    },
    [ref]
  );

  const isDark = useThemeDetector();
  return (
    <div
      className={`
    pt-3
    h-full`}
    >
      <MonacoEditor
        beforeMount={beforeMount}
        onMount={onMount}
        language={options.language || 'markdown'}
        height={height}
        width={width}
        theme={isDark ? 'kit-dark' : 'kit-light'}
        options={{ ...DEFAULT_OPTIONS, ...options }}
        value={options.value || ''}
      />
    </div>
  );
});
