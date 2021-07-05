/* eslint-disable jsx-a11y/no-autofocus */
/* eslint-disable react/prop-types */
import React, { forwardRef } from 'react';

import { InputProps } from 'kit-bridge/cjs/type';

export default forwardRef<HTMLInputElement, InputProps>(function Input(
  { onKeyDown, onKeyUp, onChange, placeholder, secret, value },
  ref
) {
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
      value={value}
    />
  );
});
