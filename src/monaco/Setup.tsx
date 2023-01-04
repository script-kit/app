import { memo, useState } from 'react';

import MonacoEditor, { loader, Monaco } from '@monaco-editor/react';
import * as monaco from 'monaco-editor';
import { kitLight, nightOwl } from './themes';

loader.config({ monaco });

function MonacoSetup() {
  const [shouldRender, setShouldRender] = useState(true);

  function removeEditor() {
    setShouldRender(false);
  }

  function handleEditorWillMount(monaco: Monaco) {
    monaco.editor.defineTheme('kit-dark', nightOwl);
    monaco.editor.defineTheme('kit-light', kitLight);
  }

  if (!shouldRender) return null;

  return (
    <div style={{ display: 'none' }}>
      {/* Hack: https://github.com/johnlindquist/kitapp/issues/200 */}
      <MonacoEditor
        language="typescript"
        onMount={removeEditor}
        beforeMount={handleEditorWillMount}
        options={{
          accessibilitySupport: 'off',
          ariaContainerElement: document.getElementById('a11y') as HTMLElement,
          renderLineHighlight: 'none',
        }}
      />
    </div>
  );
}

export default memo(MonacoSetup);
