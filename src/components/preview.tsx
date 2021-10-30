/* eslint-disable react/no-danger */
/* eslint-disable jsx-a11y/no-static-element-interactions */
/* eslint-disable react/destructuring-assignment */
import { useAtom } from 'jotai';
import React, { RefObject, useRef } from 'react';
import { previewHTMLAtom } from '../jotai';

export default function Preview() {
  const highlightRef: RefObject<any> = useRef(null);
  const [previewHTML] = useAtom(previewHTMLAtom);

  return (
    <div
      className="flex-1 overflow-scroll"
      style={{ userSelect: 'text' }}
      // onMouseUp={onMouseUp}
      ref={highlightRef}
    >
      {previewHTML && (
        <pre>
          <code dangerouslySetInnerHTML={{ __html: previewHTML }} />
        </pre>
      )}
    </div>
  );
}
