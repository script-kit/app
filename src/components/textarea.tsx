/* eslint-disable jsx-a11y/no-autofocus */
/* eslint-disable react/require-default-props */
import React, { useCallback, KeyboardEvent, useState, forwardRef } from 'react';
import { EditorConfig } from 'kit-bridge/cjs/type';

interface TextAreaProps {
  onSubmit: (value: any) => void;
  onEscape: (value: any) => void;
  height: number;
  width: number;
  options: EditorConfig;
}

export default forwardRef<HTMLTextAreaElement, TextAreaProps>(function TextArea(
  { onSubmit, onEscape, height, width, options }: TextAreaProps,
  ref
) {
  const [textAreaValue, setTextAreaValue] = useState(options.value);

  const onTextAreaKeyDown = useCallback(
    (event: KeyboardEvent<HTMLTextAreaElement>) => {
      if (event.ctrlKey || event.metaKey) {
        switch (event.key) {
          case 's':
            event.preventDefault();
            onSubmit(textAreaValue);
            setTextAreaValue('');
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
        placeholder={options.placeholder}
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
