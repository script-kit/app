/* eslint-disable jsx-a11y/no-autofocus */
/* eslint-disable react/require-default-props */
import React, { useCallback, KeyboardEvent, useState } from 'react';
import { useAtom } from 'jotai';

import { submitValueAtom, textareaConfigAtom } from '../jotai';
import useMountHeight from './hooks/useMountHeight';
import { useClose, useFocus, useSave } from '../hooks';

export default function TextArea() {
  const textareaRef = useFocus();

  const [options, setOptions] = useAtom(textareaConfigAtom);
  const [, submit] = useAtom(submitValueAtom);

  const [textAreaValue, setTextAreaValue] = useState(options.value);
  useSave(() => textAreaValue);
  useClose();
  const containerRef = useMountHeight();

  return (
    <div ref={containerRef}>
      <textarea
        ref={textareaRef}
        style={
          {
            WebkitAppRegion: 'no-drag',
            WebkitUserSelect: 'text',
            resize: 'none',
          } as any
        }
        onChange={(e) => {
          setTextAreaValue(e.target.value);
        }}
        value={textAreaValue}
        placeholder={options.placeholder}
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
    </div>
  );
}
