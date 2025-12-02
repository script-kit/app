import type { EditorOptions } from '@johnlindquist/kit/types/kitapp';
import type * as Monaco from 'monaco-editor';

export interface MonacoInitOptions {
  editor: Monaco.editor.IStandaloneCodeEditor;
  monaco: typeof Monaco;
  containerRef: React.RefObject<HTMLElement>;
  isDark: boolean;
  config: EditorOptions;
  heightOffset?: number;
}

/**
 * Common Monaco editor initialization steps shared between editor and log components
 */
export function initializeMonacoEditor({
  editor,
  monaco,
  containerRef,
  isDark,
  config,
  heightOffset = 24,
}: MonacoInitOptions): void {
  // Set theme
  monaco.editor.setTheme(isDark ? 'kit-dark' : 'kit-light');

  // Layout the editor
  editor.layout({
    width: containerRef?.current?.offsetWidth || document.body.offsetWidth,
    height: (containerRef?.current?.offsetHeight || document.body.offsetHeight) - heightOffset,
  });

  // Disable drag region
  if (editor?.getDomNode()) {
    ((editor.getDomNode() as HTMLElement).style as any).webkitAppRegion = 'no-drag';
  }

  // Handle scroll position
  const lineNumber = editor.getModel()?.getLineCount() || 0;

  if (config.scrollTo === 'bottom') {
    const lineContent = editor?.getModel()?.getLineContent(lineNumber) ?? '';
    const column = lineContent.length + 1;
    const position = { lineNumber, column };
    editor.setPosition(position);
    editor.revealPosition(position);
  }

  if (config.scrollTo === 'center') {
    editor.revealLineInCenter(Math.floor(lineNumber / 2));
  }
}
