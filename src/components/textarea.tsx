/* eslint-disable react/require-default-props */
import { ipcRenderer } from 'electron';
import React, {
  useCallback,
  KeyboardEvent,
  useState,
  forwardRef,
  useEffect,
} from 'react';
import { Channel } from '../enums';

interface TextAreaProps {
  onSubmit: (value: any) => void;
  onEscape: (value: any) => void;
  height: number;
  placeholder: string;
}

export default forwardRef<HTMLTextAreaElement, TextAreaProps>(function TextArea(
  { onSubmit, onEscape, height, placeholder }: TextAreaProps,
  ref
) {
  useEffect(() => {
    console.log(`TEXTAREA`, height);
    ipcRenderer.send(Channel.CONTENT_HEIGHT_UPDATED, height);
  }, [height]);

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
    <textarea
      ref={ref}
      style={
        {
          WebkitAppRegion: 'no-drag',
          WebkitUserSelect: 'text',
          height,
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
  );
});
