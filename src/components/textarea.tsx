/* eslint-disable jsx-a11y/no-autofocus */
/* eslint-disable react/require-default-props */
import React, { useCallback, KeyboardEvent, useState, forwardRef } from 'react';

interface TextAreaProps {
  onSubmit: (value: any) => void;
  onEscape: (value: any) => void;
  height: number;
  width: number;
  placeholder: string;
}

export default forwardRef<HTMLTextAreaElement, TextAreaProps>(function TextArea(
  { onSubmit, onEscape, height, width, placeholder }: TextAreaProps,
  ref
) {
  const [textAreaValue, setTextAreaValue] = useState('');

  const onTextAreaKeyDown = useCallback(
    (event: KeyboardEvent<HTMLTextAreaElement>) => {
      const { key, metaKey: command } = event as any;

      if (key === 'Escape') {
        event.preventDefault();
        onEscape(event);
        return;
      }
      if (key === 'Enter' && command) {
        event.preventDefault();
        onSubmit(textAreaValue);
        setTextAreaValue('');
      }
    },
    [onEscape, onSubmit, textAreaValue]
  );

  return (
    <div>
      <textarea
        ref={ref}
        autoFocus
        style={
          {
            WebkitAppRegion: 'no-drag',
            WebkitUserSelect: 'text',
            height,
            width,
          } as any
        }
        onKeyDown={onTextAreaKeyDown}
        onChange={(e) => {
          setTextAreaValue(e.target.value);
        }}
        value={textAreaValue}
        placeholder={placeholder}
        className={`
        min-h-32
      bg-transparent w-full text-black dark:text-white focus:outline-none outline-none text-md dark:placeholder-white dark:placeholder-opacity-40 placeholder-black placeholder-opacity-40
      ring-0 ring-opacity-0 focus:ring-0 focus:ring-opacity-0 pl-4 py-4
      focus:border-none border-none
      `}
      />
    </div>
  );
});
