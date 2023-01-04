import { Monaco } from '@monaco-editor/react';
import { useAtom } from 'jotai';

import { editorSuggestionsAtom } from '../jotai';

function registerPropertiesLanguage(monaco: Monaco) {
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
          value: ['if (${1:condition}) {', '\t$0', '} else {', '\t', '}'].join(
            '\n'
          ),
        },
        documentation: 'If-Else Statement',
      },
    ],
  } as any);
}

function setupMarkdownAutocomplete(monaco: Monaco) {
  const [editorSuggestions] = useAtom(editorSuggestionsAtom);

  return monaco.languages.registerCompletionItemProvider('markdown', {
    async provideCompletionItems() {
      // clear previous suggestions

      const suggestions = editorSuggestions?.map((str: string) => ({
        label: str,
        insertText: str,
      }));

      return {
        suggestions,
      };
    },
  } as any);
}

function setupTypeScript(monaco: Monaco) {
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

function setupJavaScript(monaco: Monaco) {
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

export {
  registerPropertiesLanguage,
  setupMarkdownAutocomplete,
  setupTypeScript,
  setupJavaScript,
};
