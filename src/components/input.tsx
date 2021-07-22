/* eslint-disable jsx-a11y/no-autofocus */
/* eslint-disable react/prop-types */
import React, { forwardRef, useCallback, KeyboardEvent } from 'react';

import { useAtom } from 'jotai';

import {
  indexAtom,
  inputAtom,
  placeholderAtom,
  promptDataAtom,
  submittedAtom,
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
  const [submitted] = useAtom(submittedAtom);

  const onChange = useCallback(
    (event) => {
      setIndex(0);
      setInputValue(event.target.value);
    },
    [setIndex, setInputValue]
  );

  return (
    <div className="flex flex-row">
      <input
        style={
          {
            WebkitAppRegion: 'drag',
            WebkitUserSelect: 'none',
            minHeight: '4rem',
            ...(submitted && { caretColor: 'transparent' }),
          } as any
        }
        autoFocus
        className={`
      input-component
      bg-transparent w-full text-black dark:text-white focus:outline-none outline-none text-xl dark:placeholder-white dark:placeholder-opacity-40 placeholder-black placeholder-opacity-40 h-16
  ring-0 ring-opacity-0 focus:ring-0 focus:ring-opacity-0 pl-4 py-0
  focus:border-none border-none`}
        onChange={onChange}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        ref={ref}
        type={promptData?.secret || 'text'}
        value={inputValue}
      />
      {submitted && (
        <div className="flex justify-center items-center">
          <svg
            className="animate-spin mr-4 h-6 w-6 text-primary-dark dark:text-primary-light"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
        </div>
      )}
    </div>
  );
});
