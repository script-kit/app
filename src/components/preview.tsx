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
  hasPreviewAtom,
  inputFocusAtom,
  mouseEnabledAtom,
  previewHTMLAtom,
} from '../jotai';
import { darkTheme, lightTheme } from './themes';
import { useKeyDirection } from '../hooks';

const clipboardSVG = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path fill-rule="evenodd" clip-rule="evenodd" d="M6 5C5.73478 5 5.48043 5.10536 5.29289 5.29289C5.10536 5.48043 5 5.73478 5 6V20C5 20.2652 5.10536 20.5196 5.29289 20.7071C5.48043 20.8946 5.73478 21 6 21H18C18.2652 21 18.5196 20.8946 18.7071 20.7071C18.8946 20.5196 19 20.2652 19 20V6C19 5.73478 18.8946 5.48043 18.7071 5.29289C18.5196 5.10536 18.2652 5 18 5H16C15.4477 5 15 4.55228 15 4C15 3.44772 15.4477 3 16 3H18C18.7956 3 19.5587 3.31607 20.1213 3.87868C20.6839 4.44129 21 5.20435 21 6V20C21 20.7957 20.6839 21.5587 20.1213 22.1213C19.5587 22.6839 18.7957 23 18 23H6C5.20435 23 4.44129 22.6839 3.87868 22.1213C3.31607 21.5587 3 20.7957 3 20V6C3 5.20435 3.31607 4.44129 3.87868 3.87868C4.44129 3.31607 5.20435 3 6 3H8C8.55228 3 9 3.44772 9 4C9 4.55228 8.55228 5 8 5H6Z" fill="currentColor"/><path fill-rule="evenodd" clip-rule="evenodd" d="M7 3C7 1.89543 7.89543 1 9 1H15C16.1046 1 17 1.89543 17 3V5C17 6.10457 16.1046 7 15 7H9C7.89543 7 7 6.10457 7 5V3ZM15 3H9V5H15V3Z" fill="currentColor"/></svg>`;
const copiedClipboardSVG = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path fill-rule="evenodd" clip-rule="evenodd" d="M6 5C5.73478 5 5.48043 5.10536 5.29289 5.29289C5.10536 5.48043 5 5.73478 5 6V20C5 20.2652 5.10536 20.5196 5.29289 20.7071C5.48043 20.8946 5.73478 21 6 21H18C18.2652 21 18.5196 20.8946 18.7071 20.7071C18.8946 20.5196 19 20.2652 19 20V6C19 5.73478 18.8946 5.48043 18.7071 5.29289C18.5196 5.10536 18.2652 5 18 5H16C15.4477 5 15 4.55228 15 4C15 3.44772 15.4477 3 16 3H18C18.7956 3 19.5587 3.31607 20.1213 3.87868C20.6839 4.44129 21 5.20435 21 6V20C21 20.7957 20.6839 21.5587 20.1213 22.1213C19.5587 22.6839 18.7957 23 18 23H6C5.20435 23 4.44129 22.6839 3.87868 22.1213C3.31607 21.5587 3 20.7957 3 20V6C3 5.20435 3.31607 4.44129 3.87868 3.87868C4.44129 3.31607 5.20435 3 6 3H8C8 3.55228 8.44772 4 9 4C9.55228 4 10 3.55228 10 3H6Z" fill="currentColor"/><path fill-rule="evenodd" clip-rule="evenodd" d="M7 3C7 1.89543 7.89543 1 9 1H15C16.1046 1 17 1.89543 17 3V5C17 6.10457 16.1046 7 15 7H9C7.89543 7 7 6.10457 7 5V3ZM15 3H9V5H15V3Z" fill="currentColor"/></svg>`;

export default function Preview({ height }: { height: number }) {
  const highlightRef: RefObject<any> = useRef(null);
  const [previewHTML] = useAtom(previewHTMLAtom);
  const [hasPreview] = useAtom(hasPreviewAtom);
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

  useEffect(() => {
    // add copy button to .hljs elements
    const elements = Array.from(
      document.querySelectorAll('.hljs')
    ) as HTMLElement[];
    elements.forEach((element) => {
      // parent is a <pre> element
      const parent = element.parentElement;
      if (!parent) return;

      parent.style.position = 'relative';
      const copyButton = document.createElement('button');
      copyButton.innerHTML = clipboardSVG;
      parent.classList.add('not-prose');
      copyButton.classList.add('hljs-copy-button');
      parent.appendChild(copyButton);

      copyButton.addEventListener('click', (event: any) => {
        const text = element.innerText;
        navigator.clipboard.writeText(text);

        copyButton.classList.add('hljs-copy-checked');
      });
    });
    // when click on copy button, copy the cod
  }, [previewHTML]);

  return (
    <motion.div
      key="preview"
      id="preview"
      className="overflow-scroll w-full"
      style={{ userSelect: 'text', height }}
      initial={{ opacity: 0, width: 0 }}
      animate={{
        opacity: 1,

        width: '100%',
        transition: {
          delay: 0.1,
          duration: 0.1,
          ease: 'easeIn',
        },
      }}
      exit={{
        opacity: 0,
        width: 0,
        transition: {
          duration: 0,
        },
      }}
      // onMouseUp={onMouseUp}
      ref={highlightRef}
      onMouseDown={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <style type="text/css">{isDark ? darkTheme : lightTheme}</style>
      {previewHTML && (
        <div
          className="w-full preview"
          dangerouslySetInnerHTML={{ __html: previewHTML }}
        />
      )}
    </motion.div>
  );
}
