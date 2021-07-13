/* eslint-disable jsx-a11y/no-autofocus */
/* eslint-disable react/prop-types */
import React, { forwardRef, useCallback, KeyboardEvent } from 'react';

import { useAtom } from 'jotai';
import {
  indexAtom,
  inputAtom,
  placeholderAtom,
  promptDataAtom,
} from '../jotai';

interface InputProps {
  onKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void;
  placeholder: string;
}

export default forwardRef<HTMLInputElement, InputProps>(function Input(
  { onKeyDown },
  ref
) {
  const [inputValue, setInputValue] = useAtom(inputAtom);
  const [index, setIndex] = useAtom(indexAtom);
  const [placeholder] = useAtom(placeholderAtom);
  const [promptData] = useAtom(promptDataAtom);

  const onChange = useCallback(
    (event) => {
      setIndex(0);
      setInputValue(event.target.value);
    },
    [setIndex, setInputValue]
  );

  return (
    <input
      style={
        {
          WebkitAppRegion: 'drag',
          WebkitUserSelect: 'none',
          minHeight: '4rem',
          // ...(caretDisabled && { caretColor: 'transparent' }),
        } as any
      }
      autoFocus
      className={`bg-transparent w-full text-black dark:text-white focus:outline-none outline-none text-xl dark:placeholder-white dark:placeholder-opacity-40 placeholder-black placeholder-opacity-40 h-16
  ring-0 ring-opacity-0 focus:ring-0 focus:ring-opacity-0 pl-4 py-0
  focus:border-none border-none`}
      onChange={onChange}
      onKeyDown={onKeyDown}
      placeholder={placeholder}
      ref={ref}
      type={promptData?.secret || 'text'}
      value={inputValue}
    />
  );
});
