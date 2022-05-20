/* eslint-disable @typescript-eslint/no-use-before-define */
/* eslint-disable react/no-danger */
/* eslint-disable jsx-a11y/no-static-element-interactions */
/* eslint-disable react/destructuring-assignment */
import { useAtom } from 'jotai';
import { motion } from 'framer-motion';

import React, { RefObject, useCallback, useEffect, useRef } from 'react';
import {
  cmdAtom,
  darkAtom,
  inputFocusAtom,
  mouseEnabledAtom,
  previewHTMLAtom,
} from '../jotai';
import { darkTheme, lightTheme } from './themes';
import { useKeyDirection } from '../hooks';

export default function Preview() {
  const highlightRef: RefObject<any> = useRef(null);
  const [previewHTML] = useAtom(previewHTMLAtom);
  const [inputFocus, setInputFocus] = useAtom(inputFocusAtom);
  const [mouseEnabled] = useAtom(mouseEnabledAtom);
  const [isDark] = useAtom(darkAtom);
  const [cmd] = useAtom(cmdAtom);

  useKeyDirection(
    (key) => {
      if (!key.startsWith(cmd)) return;
      let top = highlightRef.current.scrollTop;

      if (key.endsWith('up')) top = -200;
      if (key.endsWith('down')) top = 200;

      highlightRef.current.scrollBy({
        top,
        behavior: 'smooth',
      });
    },
    [highlightRef, cmd]
  );

  useEffect(() => {
    if (highlightRef.current) {
      highlightRef.current.scrollTop = 0;
      highlightRef.current.scrollLeft = 0;
    }
  }, [previewHTML]);

  const onMouseEnter = useCallback(() => {
    if (mouseEnabled) setInputFocus(false);
  }, [setInputFocus, mouseEnabled]);

  const onMouseLeave = useCallback(() => {
    setInputFocus(true);
  }, [setInputFocus]);

  return (
    <motion.div
      key="preview"
      id="preview"
      className="overflow-scroll w-full h-full"
      style={{ userSelect: 'text' }}
      initial={{ opacity: 0, width: 0 }}
      animate={{ opacity: 1, width: '100%' }}
      transition={{ duration: 0.2 }}
      exit={{ opacity: 0, width: 0 }}
      // onMouseUp={onMouseUp}
      ref={highlightRef}
      onMouseDown={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <style type="text/css">{isDark ? darkTheme : lightTheme}</style>
      {previewHTML && (
        <div
          className="w-full h-full"
          dangerouslySetInnerHTML={{ __html: previewHTML }}
        />
      )}
    </motion.div>
  );
}
