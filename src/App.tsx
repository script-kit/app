import IpcBridge from './ipc-bridge';
import Container from './container';

import MonacoEditor, { loader } from '@monaco-editor/react';
import * as monaco from 'monaco-editor';
import { useEffect, useState } from 'react';
loader.config({ monaco });

export default function App() {
  const [start, setStart] = useState(false);

  useEffect(() => {
    setTimeout(() => {
      setStart(true);
    }, 100);
  }, []);

  return (
    <div>
      {start ? (
        <>
          <IpcBridge />
          <Container />
        </>
      ) : (
        <div style={{ display: 'none' }}>
          {/* Hack: https://github.com/johnlindquist/kitapp/issues/200 */}
          <MonacoEditor
            language="typescript"
            options={{
              accessibilitySupport: 'off',
              ariaContainerElement: document.getElementById(
                'a11y'
              ) as HTMLElement,
              renderLineHighlight: 'none',
            }}
          />
        </div>
      )}
    </div>
  );
}

// .monaco-editor .view-overlays .current-line
