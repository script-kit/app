import React, { forwardRef, useCallback, useEffect } from 'react';
import path from 'path';
import { useAtom } from 'jotai';
import MonacoEditor, { loader } from '@monaco-editor/react';
import { editor } from 'monaco-editor';
import { EditorOptions, EditorProps } from 'kit-bridge/cjs/type';
import { useThemeDetector } from '../hooks';
import { editorConfigAtom } from '../jotai';

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

export default forwardRef<any, any>(function Editor(
  { height, width }: EditorProps,
  ref: any
) {
  const [options] = useAtom(editorConfigAtom);

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
    [options, ref]
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
        language={(options as EditorOptions)?.language || 'markdown'}
        height={height}
        width={width}
        theme={isDark ? 'kit-dark' : 'kit-light'}
        options={{ ...DEFAULT_OPTIONS, ...(options as EditorOptions) }}
        value={(options as EditorOptions)?.value || ''}
      />
    </div>
  );
});
