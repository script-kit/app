import React, { ErrorInfo, useCallback, useEffect } from 'react';
import path from 'path';
import { useAtom } from 'jotai';
import MonacoEditor, { Monaco, loader } from '@monaco-editor/react';
import { motion } from 'framer-motion';

import { editor as monacoEditor } from 'monaco-editor';
import { UI } from '@johnlindquist/kit/cjs/enum';
import { EditorOptions } from '@johnlindquist/kit/types/kitapp';
import {
  darkAtom,
  editorConfigAtom,
  editorInstanceAtom,
  inputAtom,
  monacoAtom,
  openAtom,
  uiAtom,
} from '../jotai';
import {
  useClose,
  useEscape,
  useMountMainHeight,
  useSave,
  useOpen,
} from '../hooks';

class ErrorBoundary extends React.Component {
  render() {
    return this.props.children;
  }
}

function ensureFirstBackSlash(str: string) {
  return str.length > 0 && str.charAt(0) !== '/' ? `/${str}` : str;
}

function uriFromPath(_path: string) {
  const pathName = path.resolve(_path).replace(/\\/g, '/');
  return encodeURI(`file://${ensureFirstBackSlash(pathName)}`);
}

const vs = uriFromPath(path.join(__dirname, '../assets/vs'));

console.log(`vs: ${vs}`);
loader.config({
  paths: {
    vs,
  },
});

// loader.config({
//   paths: {
//     vs: uriFromPath(
//       path.join(__dirname, '../node_modules/monaco-editor/min/vs')
//     ),
//   },
// });

const DEFAULT_OPTIONS: monacoEditor.IStandaloneEditorConstructionOptions = {
  fontFamily: 'JetBrains Mono',
  fontSize: 18,
  minimap: {
    enabled: false,
  },
  wordWrap: 'on',
  lineNumbers: 'off',
  glyphMargin: false,
  scrollBeyondLastLine: false,
  automaticLayout: true,
  quickSuggestions: false,
  // folding: false,
  // Undocumented see https://github.com/Microsoft/vscode/issues/30795#issuecomment-410998882
  // lineDecorationsWidth: 0,
  // lineNumbersMinChars: 0,
};

export default function Editor() {
  const [options] = useAtom(editorConfigAtom);
  const [isDark] = useAtom(darkAtom);
  const [open] = useAtom(openAtom);
  const [inputValue, setInputValue] = useAtom(inputAtom);
  const [ui] = useAtom(uiAtom);
  const [monaco, setMonaco] = useAtom(monacoAtom);
  const [editor, setEditor] = useAtom(editorInstanceAtom);

  useSave(inputValue);
  useClose();
  useEscape();
  useOpen();

  const containerRef = useMountMainHeight();

  const beforeMount = useCallback(
    (m: Monaco) => {
      setMonaco(m);

      m.editor.defineTheme('kit-dark', nightOwl);
      m.editor.defineTheme('kit-light', {
        base: 'vs',
        inherit: true,
        rules: [],
        colors: {
          'editor.background': '#FFFFFF00',
        },
      });

      m.languages.typescript.typescriptDefaults.setCompilerOptions({
        target: m.languages.typescript.ScriptTarget.ESNext,
        allowNonTsExtensions: true,
        moduleResolution: m.languages.typescript.ModuleResolutionKind.NodeJs,
        module: m.languages.typescript.ModuleKind.ESNext,
      });

      m.languages.typescript.javascriptDefaults.setCompilerOptions({
        target: m.languages.typescript.ScriptTarget.ESNext,
        allowNonTsExtensions: true,
        moduleResolution: m.languages.typescript.ModuleResolutionKind.NodeJs,
        module: m.languages.typescript.ModuleKind.ESNext,
      });
    },
    [setMonaco]
  );

  const onMount = useCallback(
    (editorInstance: monacoEditor.IStandaloneCodeEditor) => {
      setEditor(editorInstance);

      editorInstance.focus();
    },
    [setEditor]
  );

  const onChange = useCallback((value) => {
    setInputValue(value);
  }, []);

  useEffect(() => {
    if (ui === UI.editor && open) {
      if (options?.value) {
        setInputValue(options.value);
      }
    }
  }, [open, options, options?.value]);

  useEffect(() => {
    if (!monaco) return;
    if (typeof options !== 'string') {
      if (options?.language === 'typescript') {
        if (options?.extraLibs?.length) {
          for (const { content, filePath } of options.extraLibs) {
            monaco.languages.typescript.typescriptDefaults.addExtraLib(
              content,
              filePath
            );
          }
        }
      }

      if (options?.language === 'javascript') {
        if (options?.extraLibs?.length) {
          for (const { content, filePath } of options.extraLibs) {
            monaco.languages.typescript.javascriptDefaults.addExtraLib(
              content,
              filePath
            );
          }
        }
      }
    }

    monaco.editor.setTheme(isDark ? 'kit-dark' : 'kit-light');

    if (!editor) return;

    if (typeof global?.exports === 'undefined') global.exports = {};
    editor.focus();

    if (editor?.getDomNode())
      ((editor.getDomNode() as HTMLElement).style as any).webkitAppRegion =
        'no-drag';

    const lineNumber = editor.getModel()?.getLineCount() || 0;
    if ((options as EditorOptions).scrollTo === 'bottom') {
      const column =
        (editor?.getModel()?.getLineContent(lineNumber).length || 0) + 1;
      editor.setPosition({ lineNumber, column });

      editor.revealPosition({ lineNumber, column });
    }

    if ((options as EditorOptions).scrollTo === 'center') {
      editor.revealLineInCenter(Math.floor(lineNumber / 2));
    }
  }, [monaco, editor, options, isDark]);

  return (
    <motion.div
      key="editor"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.2 }}
      ref={containerRef}
      className={`
    pt-3
    w-full h-full`}
    >
      <ErrorBoundary>
        <MonacoEditor
          height="100%"
          width="100%"
          beforeMount={beforeMount}
          onMount={onMount}
          language={(options as EditorOptions)?.language || 'markdown'}
          theme={isDark ? 'kit-dark' : 'kit-light'}
          options={{ ...DEFAULT_OPTIONS, ...(options as EditorOptions) }}
          value={(options as EditorOptions)?.value || ''}
          onChange={onChange}
        />
      </ErrorBoundary>
    </motion.div>
  );
}

const nightOwl: monacoEditor.IStandaloneThemeData = {
  base: 'vs-dark',
  inherit: true,
  rules: [
    {
      background: '011627',
      token: '',
    },
    {
      foreground: '637777',
      token: 'comment',
    },
    {
      foreground: 'addb67',
      token: 'string',
    },
    {
      foreground: 'ecc48d',
      token: 'vstring.quoted',
    },
    {
      foreground: 'ecc48d',
      token: 'variable.other.readwrite.js',
    },
    {
      foreground: '5ca7e4',
      token: 'string.regexp',
    },
    {
      foreground: '5ca7e4',
      token: 'string.regexp keyword.other',
    },
    {
      foreground: '5f7e97',
      token: 'meta.function punctuation.separator.comma',
    },
    {
      foreground: 'f78c6c',
      token: 'constant.numeric',
    },
    {
      foreground: 'f78c6c',
      token: 'constant.character.numeric',
    },
    {
      foreground: 'addb67',
      token: 'variable',
    },
    {
      foreground: 'c792ea',
      token: 'keyword',
    },
    {
      foreground: 'c792ea',
      token: 'punctuation.accessor',
    },
    {
      foreground: 'c792ea',
      token: 'storage',
    },
    {
      foreground: 'c792ea',
      token: 'meta.var.expr',
    },
    {
      foreground: 'c792ea',
      token:
        'meta.class meta.method.declaration meta.var.expr storage.type.jsm',
    },
    {
      foreground: 'c792ea',
      token: 'storage.type.property.js',
    },
    {
      foreground: 'c792ea',
      token: 'storage.type.property.ts',
    },
    {
      foreground: 'c792ea',
      token: 'storage.type.property.tsx',
    },
    {
      foreground: '82aaff',
      token: 'storage.type',
    },
    {
      foreground: 'ffcb8b',
      token: 'entity.name.class',
    },
    {
      foreground: 'ffcb8b',
      token: 'meta.class entity.name.type.class',
    },
    {
      foreground: 'addb67',
      token: 'entity.other.inherited-class',
    },
    {
      foreground: '82aaff',
      token: 'entity.name.function',
    },
    {
      foreground: 'addb67',
      token: 'punctuation.definition.variable',
    },
    {
      foreground: 'd3423e',
      token: 'punctuation.section.embedded',
    },
    {
      foreground: 'd6deeb',
      token: 'punctuation.terminator.expression',
    },
    {
      foreground: 'd6deeb',
      token: 'punctuation.definition.arguments',
    },
    {
      foreground: 'd6deeb',
      token: 'punctuation.definition.array',
    },
    {
      foreground: 'd6deeb',
      token: 'punctuation.section.array',
    },
    {
      foreground: 'd6deeb',
      token: 'meta.array',
    },
    {
      foreground: 'd9f5dd',
      token: 'punctuation.definition.list.begin',
    },
    {
      foreground: 'd9f5dd',
      token: 'punctuation.definition.list.end',
    },
    {
      foreground: 'd9f5dd',
      token: 'punctuation.separator.arguments',
    },
    {
      foreground: 'd9f5dd',
      token: 'punctuation.definition.list',
    },
    {
      foreground: 'd3423e',
      token: 'string.template meta.template.expression',
    },
    {
      foreground: 'd6deeb',
      token: 'string.template punctuation.definition.string',
    },
    {
      foreground: 'c792ea',
      fontStyle: 'italic',
      token: 'italic',
    },
    {
      foreground: 'addb67',
      fontStyle: 'bold',
      token: 'bold',
    },
    {
      foreground: '82aaff',
      token: 'constant.language',
    },
    {
      foreground: '82aaff',
      token: 'punctuation.definition.constant',
    },
    {
      foreground: '82aaff',
      token: 'variable.other.constant',
    },
    {
      foreground: '7fdbca',
      token: 'support.function.construct',
    },
    {
      foreground: '7fdbca',
      token: 'keyword.other.new',
    },
    {
      foreground: '82aaff',
      token: 'constant.character',
    },
    {
      foreground: '82aaff',
      token: 'constant.other',
    },
    {
      foreground: 'f78c6c',
      token: 'constant.character.escape',
    },
    {
      foreground: 'addb67',
      token: 'entity.other.inherited-class',
    },
    {
      foreground: 'd7dbe0',
      token: 'variable.parameter',
    },
    {
      foreground: '7fdbca',
      token: 'entity.name.tag',
    },
    {
      foreground: 'cc2996',
      token: 'punctuation.definition.tag.html',
    },
    {
      foreground: 'cc2996',
      token: 'punctuation.definition.tag.begin',
    },
    {
      foreground: 'cc2996',
      token: 'punctuation.definition.tag.end',
    },
    {
      foreground: 'addb67',
      token: 'entity.other.attribute-name',
    },
    {
      foreground: 'addb67',
      token: 'entity.name.tag.custom',
    },
    {
      foreground: '82aaff',
      token: 'support.function',
    },
    {
      foreground: '82aaff',
      token: 'support.constant',
    },
    {
      foreground: '7fdbca',
      token: 'upport.constant.meta.property-value',
    },
    {
      foreground: 'addb67',
      token: 'support.type',
    },
    {
      foreground: 'addb67',
      token: 'support.class',
    },
    {
      foreground: 'addb67',
      token: 'support.variable.dom',
    },
    {
      foreground: '7fdbca',
      token: 'support.constant',
    },
    {
      foreground: '7fdbca',
      token: 'keyword.other.special-method',
    },
    {
      foreground: '7fdbca',
      token: 'keyword.other.new',
    },
    {
      foreground: '7fdbca',
      token: 'keyword.other.debugger',
    },
    {
      foreground: '7fdbca',
      token: 'keyword.control',
    },
    {
      foreground: 'c792ea',
      token: 'keyword.operator.comparison',
    },
    {
      foreground: 'c792ea',
      token: 'keyword.control.flow.js',
    },
    {
      foreground: 'c792ea',
      token: 'keyword.control.flow.ts',
    },
    {
      foreground: 'c792ea',
      token: 'keyword.control.flow.tsx',
    },
    {
      foreground: 'c792ea',
      token: 'keyword.control.ruby',
    },
    {
      foreground: 'c792ea',
      token: 'keyword.control.module.ruby',
    },
    {
      foreground: 'c792ea',
      token: 'keyword.control.class.ruby',
    },
    {
      foreground: 'c792ea',
      token: 'keyword.control.def.ruby',
    },
    {
      foreground: 'c792ea',
      token: 'keyword.control.loop.js',
    },
    {
      foreground: 'c792ea',
      token: 'keyword.control.loop.ts',
    },
    {
      foreground: 'c792ea',
      token: 'keyword.control.import.js',
    },
    {
      foreground: 'c792ea',
      token: 'keyword.control.import.ts',
    },
    {
      foreground: 'c792ea',
      token: 'keyword.control.import.tsx',
    },
    {
      foreground: 'c792ea',
      token: 'keyword.control.from.js',
    },
    {
      foreground: 'c792ea',
      token: 'keyword.control.from.ts',
    },
    {
      foreground: 'c792ea',
      token: 'keyword.control.from.tsx',
    },
    {
      foreground: 'ffffff',
      background: 'ff2c83',
      token: 'invalid',
    },
    {
      foreground: 'ffffff',
      background: 'd3423e',
      token: 'invalid.deprecated',
    },
    {
      foreground: '7fdbca',
      token: 'keyword.operator',
    },
    {
      foreground: 'c792ea',
      token: 'keyword.operator.relational',
    },
    {
      foreground: 'c792ea',
      token: 'keyword.operator.assignement',
    },
    {
      foreground: 'c792ea',
      token: 'keyword.operator.arithmetic',
    },
    {
      foreground: 'c792ea',
      token: 'keyword.operator.bitwise',
    },
    {
      foreground: 'c792ea',
      token: 'keyword.operator.increment',
    },
    {
      foreground: 'c792ea',
      token: 'keyword.operator.ternary',
    },
    {
      foreground: '637777',
      token: 'comment.line.double-slash',
    },
    {
      foreground: 'cdebf7',
      token: 'object',
    },
    {
      foreground: 'ff5874',
      token: 'constant.language.null',
    },
    {
      foreground: 'd6deeb',
      token: 'meta.brace',
    },
    {
      foreground: 'c792ea',
      token: 'meta.delimiter.period',
    },
    {
      foreground: 'd9f5dd',
      token: 'punctuation.definition.string',
    },
    {
      foreground: 'ff5874',
      token: 'constant.language.boolean',
    },
    {
      foreground: 'ffffff',
      token: 'object.comma',
    },
    {
      foreground: '7fdbca',
      token: 'variable.parameter.function',
    },
    {
      foreground: '80cbc4',
      token: 'support.type.vendor.property-name',
    },
    {
      foreground: '80cbc4',
      token: 'support.constant.vendor.property-value',
    },
    {
      foreground: '80cbc4',
      token: 'support.type.property-name',
    },
    {
      foreground: '80cbc4',
      token: 'meta.property-list entity.name.tag',
    },
    {
      foreground: '57eaf1',
      token: 'meta.property-list entity.name.tag.reference',
    },
    {
      foreground: 'f78c6c',
      token: 'constant.other.color.rgb-value punctuation.definition.constant',
    },
    {
      foreground: 'ffeb95',
      token: 'constant.other.color',
    },
    {
      foreground: 'ffeb95',
      token: 'keyword.other.unit',
    },
    {
      foreground: 'c792ea',
      token: 'meta.selector',
    },
    {
      foreground: 'fad430',
      token: 'entity.other.attribute-name.id',
    },
    {
      foreground: '80cbc4',
      token: 'meta.property-name',
    },
    {
      foreground: 'c792ea',
      token: 'entity.name.tag.doctype',
    },
    {
      foreground: 'c792ea',
      token: 'meta.tag.sgml.doctype',
    },
    {
      foreground: 'd9f5dd',
      token: 'punctuation.definition.parameters',
    },
    {
      foreground: 'ecc48d',
      token: 'string.quoted',
    },
    {
      foreground: 'ecc48d',
      token: 'string.quoted.double',
    },
    {
      foreground: 'ecc48d',
      token: 'string.quoted.single',
    },
    {
      foreground: 'addb67',
      token: 'support.constant.math',
    },
    {
      foreground: 'addb67',
      token: 'support.type.property-name.json',
    },
    {
      foreground: 'addb67',
      token: 'support.constant.json',
    },
    {
      foreground: 'c789d6',
      token: 'meta.structure.dictionary.value.json string.quoted.double',
    },
    {
      foreground: '80cbc4',
      token: 'string.quoted.double.json punctuation.definition.string.json',
    },
    {
      foreground: 'ff5874',
      token:
        'meta.structure.dictionary.json meta.structure.dictionary.value constant.language',
    },
    {
      foreground: 'd6deeb',
      token: 'variable.other.ruby',
    },
    {
      foreground: 'ecc48d',
      token: 'entity.name.type.class.ruby',
    },
    {
      foreground: 'ecc48d',
      token: 'keyword.control.class.ruby',
    },
    {
      foreground: 'ecc48d',
      token: 'meta.class.ruby',
    },
    {
      foreground: '7fdbca',
      token: 'constant.language.symbol.hashkey.ruby',
    },
    {
      foreground: 'e0eddd',
      background: 'a57706',
      fontStyle: 'italic',
      token: 'meta.diff',
    },
    {
      foreground: 'e0eddd',
      background: 'a57706',
      fontStyle: 'italic',
      token: 'meta.diff.header',
    },
    {
      foreground: 'ef535090',
      fontStyle: 'italic',
      token: 'markup.deleted',
    },
    {
      foreground: 'a2bffc',
      fontStyle: 'italic',
      token: 'markup.changed',
    },
    {
      foreground: 'a2bffc',
      fontStyle: 'italic',
      token: 'meta.diff.header.git',
    },
    {
      foreground: 'a2bffc',
      fontStyle: 'italic',
      token: 'meta.diff.header.from-file',
    },
    {
      foreground: 'a2bffc',
      fontStyle: 'italic',
      token: 'meta.diff.header.to-file',
    },
    {
      foreground: '219186',
      background: 'eae3ca',
      token: 'markup.inserted',
    },
    {
      foreground: 'd3201f',
      token: 'other.package.exclude',
    },
    {
      foreground: 'd3201f',
      token: 'other.remove',
    },
    {
      foreground: '269186',
      token: 'other.add',
    },
    {
      foreground: 'ff5874',
      token: 'constant.language.python',
    },
    {
      foreground: '82aaff',
      token: 'variable.parameter.function.python',
    },
    {
      foreground: '82aaff',
      token: 'meta.function-call.arguments.python',
    },
    {
      foreground: 'b2ccd6',
      token: 'meta.function-call.python',
    },
    {
      foreground: 'b2ccd6',
      token: 'meta.function-call.generic.python',
    },
    {
      foreground: 'd6deeb',
      token: 'punctuation.python',
    },
    {
      foreground: 'addb67',
      token: 'entity.name.function.decorator.python',
    },
    {
      foreground: '8eace3',
      token: 'source.python variable.language.special',
    },
    {
      foreground: '82b1ff',
      token: 'markup.heading.markdown',
    },
    {
      foreground: 'c792ea',
      fontStyle: 'italic',
      token: 'markup.italic.markdown',
    },
    {
      foreground: 'addb67',
      fontStyle: 'bold',
      token: 'markup.bold.markdown',
    },
    {
      foreground: '697098',
      token: 'markup.quote.markdown',
    },
    {
      foreground: '80cbc4',
      token: 'markup.inline.raw.markdown',
    },
    {
      foreground: 'ff869a',
      token: 'markup.underline.link.markdown',
    },
    {
      foreground: 'ff869a',
      token: 'markup.underline.link.image.markdown',
    },
    {
      foreground: 'd6deeb',
      token: 'string.other.link.title.markdown',
    },
    {
      foreground: 'd6deeb',
      token: 'string.other.link.description.markdown',
    },
    {
      foreground: '82b1ff',
      token: 'punctuation.definition.string.markdown',
    },
    {
      foreground: '82b1ff',
      token: 'punctuation.definition.string.begin.markdown',
    },
    {
      foreground: '82b1ff',
      token: 'punctuation.definition.string.end.markdown',
    },
    {
      foreground: '82b1ff',
      token: 'meta.link.inline.markdown punctuation.definition.string',
    },
    {
      foreground: '7fdbca',
      token: 'punctuation.definition.metadata.markdown',
    },
    {
      foreground: '82b1ff',
      token: 'beginning.punctuation.definition.list.markdown',
    },
  ],
  colors: {
    'editor.foreground': '#d6deeb',
    'editor.background': '#00000000',
    'editor.selectionBackground': '#ffffff22',
    'editor.lineHighlightBackground': '#ffffff01',
    'editorCursor.foreground': '#80a4c2',
    'editorWhitespace.foreground': '#2e2040',
    'editorIndentGuide.background': '#5e81ce52',
    'editor.selectionHighlightBorder': '#122d42',
  },
};
