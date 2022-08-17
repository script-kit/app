/* eslint-disable jsx-a11y/no-autofocus */
/* eslint-disable react/require-default-props */
import React, { LegacyRef, useRef } from 'react';
import { motion } from 'framer-motion';
import { useAtom } from 'jotai';

import { inputAtom, promptDataAtom } from '../jotai';
import { useClose, useFocus, useMountMainHeight } from '../hooks';

// RESIZE ME!!!!!

export default function TextArea() {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  useFocus(textareaRef);
  // useOpen();

  const [promptData] = useAtom(promptDataAtom);

  const [input, setInput] = useAtom(inputAtom);

  // useSave(textAreaValue);
  useClose();
  // useEscape();
  const containerRef = useMountMainHeight();

  return (
    <motion.div
      key="textarea"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.2 }}
      ref={containerRef}
    >
      <textarea
        ref={textareaRef as LegacyRef<HTMLTextAreaElement>}
        style={
          {
            WebkitAppRegion: 'no-drag',
            WebkitUserSelect: 'text',
            resize: 'none',
          } as any
        }
        onChange={(e) => {
          setInput(e.target.value);
        }}
        value={input}
        placeholder={promptData?.placeholder || 'Enter a value'}
        className={`
        visible-scrollbar
        min-h-64
        w-full h-full
        bg-transparent text-black dark:text-white focus:outline-none outline-none text-md
        dark:placeholder-white dark:placeholder-opacity-40 placeholder-black placeholder-opacity-40
        ring-0 ring-opacity-0 focus:ring-0 focus:ring-opacity-0 pl-4 py-4
        focus:border-none border-none
        `}
      />
    </motion.div>
  );
}
