/* eslint-disable @typescript-eslint/no-use-before-define */
/* eslint-disable react/no-danger */
/* eslint-disable jsx-a11y/no-static-element-interactions */
/* eslint-disable react/destructuring-assignment */
import { useAtom } from 'jotai';
import React, { RefObject, useCallback, useEffect, useRef } from 'react';
import { darkAtom, inputFocusAtom, previewHTMLAtom } from '../jotai';
import { darkTheme, lightTheme } from './themes';

export default function Preview() {
  const highlightRef: RefObject<any> = useRef(null);
  const [previewHTML] = useAtom(previewHTMLAtom);
  const [, setInputFocus] = useAtom(inputFocusAtom);
  const [isDark] = useAtom(darkAtom);

  useEffect(() => {
    if (highlightRef.current) {
      highlightRef.current.scrollTop = 0;
      highlightRef.current.scrollLeft = 0;
    }
  }, [previewHTML]);

  const onMouseEnter = useCallback(() => {
    setInputFocus(false);
  }, [setInputFocus]);

  const onMouseLeave = useCallback(() => {
    setInputFocus(true);
  }, [setInputFocus]);

  return (
    <div
      className="overflow-scroll w-full h-full"
      style={{ userSelect: 'text' }}
      // onMouseUp={onMouseUp}
      ref={highlightRef}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <style type="text/css">{isDark ? darkTheme : lightTheme}</style>
      {previewHTML && (
        <div
          className="w-full h-full"
          dangerouslySetInnerHTML={{ __html: previewHTML }}
        />
      )}
    </div>
  );
}
