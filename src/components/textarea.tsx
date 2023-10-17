/* eslint-disable jsx-a11y/no-autofocus */
/* eslint-disable react/require-default-props */
import React, { LegacyRef, useRef } from 'react';
import { UI } from '@johnlindquist/kit/cjs/enum';
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
    <div id={UI.textarea} key="textarea" ref={containerRef}>
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
        text-md
        h-full min-h-64
        w-full border-none  bg-transparent py-4 pl-4
         text-text-base placeholder-black
        placeholder-opacity-40 outline-none ring-0 ring-opacity-0 focus:border-none focus:outline-none
        focus:ring-0 focus:ring-opacity-0
        `}
      />
    </div>
  );
}
