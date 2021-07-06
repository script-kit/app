/* eslint-disable jsx-a11y/no-autofocus */
/* eslint-disable react/prop-types */
import React, { forwardRef, useCallback } from 'react';
import { useAtom } from 'jotai';
import { InputProps } from 'kit-bridge/cjs/type';
import { inputAtom, placeholderAtom } from '../jotai';

export default forwardRef<HTMLInputElement, InputProps>(function Input(
  { onKeyDown, secret },
  ref
) {
  const [inputValue, setInputValue] = useAtom(inputAtom);
  const [index, setIndex] = useAtom(inputAtom);
  const [placeholder] = useAtom(placeholderAtom);

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
      type={secret ? 'password' : 'text'}
      value={inputValue}
    />
  );
});
