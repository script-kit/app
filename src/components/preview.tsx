/* eslint-disable react/no-danger */
/* eslint-disable jsx-a11y/no-static-element-interactions */
/* eslint-disable react/destructuring-assignment */
import { useAtom } from 'jotai';
import React, { RefObject, useCallback, useRef } from 'react';
import { inputFocusAtom, previewHTMLAtom } from '../jotai';

export default function Preview() {
  const highlightRef: RefObject<any> = useRef(null);
  const [previewHTML] = useAtom(previewHTMLAtom);
  const [, setInputFocus] = useAtom(inputFocusAtom);

  const onMouseEnter = useCallback(() => {
    setInputFocus(false);
  }, [setInputFocus]);

  const onMouseLeave = useCallback(() => {
    setInputFocus(true);
  }, [setInputFocus]);

  return (
    <div
      className="flex-1 overflow-scroll"
      style={{ userSelect: 'text' }}
      // onMouseUp={onMouseUp}
      ref={highlightRef}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      {previewHTML && (
        <pre>
          <code dangerouslySetInnerHTML={{ __html: previewHTML }} />
        </pre>
      )}
    </div>
  );
}
