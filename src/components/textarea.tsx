/* eslint-disable jsx-a11y/no-autofocus */
/* eslint-disable react/require-default-props */
import React, {
  useCallback,
  KeyboardEvent,
  useState,
  useRef,
  RefObject,
  useLayoutEffect,
} from 'react';
import { useAtom } from 'jotai';

import { textareaConfigAtom } from '../jotai';
import useMountHeight from './hooks/useMountHeight';

interface TextAreaProps {
  onSubmit: (value: any) => void;
  onEscape: (value: any) => void;
}

export default function TextArea({ onSubmit, onEscape }: TextAreaProps) {
  const [options, setOptions] = useAtom(textareaConfigAtom);

  const [textAreaValue, setTextAreaValue] = useState(options.value);

  const onTextAreaKeyDown = useCallback(
    (event: KeyboardEvent<HTMLTextAreaElement>) => {
      if (event.ctrlKey || event.metaKey) {
        switch (event.key) {
          case 's':
            event.preventDefault();
            onSubmit(textAreaValue);
            break;

          case 'w':
            event.preventDefault();
            onEscape(event);
            break;

          default:
            break;
        }
      }
    },
    [onEscape, onSubmit, textAreaValue]
  );
  const containerRef = useMountHeight();

  return (
    <div ref={containerRef}>
      <textarea
        autoFocus
        style={
          {
            WebkitAppRegion: 'no-drag',
            WebkitUserSelect: 'text',
            resize: 'none',
          } as any
        }
        onKeyDown={onTextAreaKeyDown}
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
