import React, { forwardRef, useCallback, useEffect, useState } from 'react';
import path from 'path';
import MonacoEditor, { loader, useMonaco } from '@monaco-editor/react';
import { editor, KeyCode } from 'monaco-editor';
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
    vs: uriFromPath(
      path.join(__dirname, '../node_modules/monaco-editor/min/vs')
    ),
  },
});

const DEFAULT_OPTIONS: editor.IStandaloneEditorConstructionOptions = {
  fontSize: 16,
  minimap: {
    enabled: false,
  },
  padding: {
    top: 16,
  },
  wordWrap: 'on',
};

export default forwardRef<any, any>(function Editor(
  { options }: EditorProps,
  ref: any
) {
  useEffect(() => {
    return () => {
      ref(null);
    };
  }, [ref]);
  const onMount = useCallback(
    (editorInstance: editor.IStandaloneCodeEditor) => {
      ref(editorInstance);
      if (editorInstance?.getDomNode())
        (editorInstance.getDomNode() as HTMLElement).style.webkitAppRegion =
          'no-drag';
    },
    [ref]
  );

  const isDark = useThemeDetector();

  return (
    <MonacoEditor
      onMount={onMount}
      language={options.language || 'markdown'}
      height="100vh"
      theme={isDark ? 'vs-dark' : 'light'}
      options={{ ...DEFAULT_OPTIONS, ...options }}
      value={options.content || ''}
    />
  );
});
