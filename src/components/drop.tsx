/* eslint-disable jsx-a11y/no-noninteractive-element-interactions */
/* eslint-disable jsx-a11y/no-static-element-interactions */
/* eslint-disable jsx-a11y/no-noninteractive-tabindex */
/* eslint-disable react/prop-types */
import React, { forwardRef, KeyboardEvent, useCallback, useState } from 'react';

import { DropProps } from 'kit-bridge/cjs/type';

export default forwardRef<HTMLDivElement, DropProps>(function Drop(
  { placeholder, submit, onEscape, width, height },
  ref
) {
  const [dropReady, setDropReady] = useState(false);
  const [dropMessage, setDropMessage] = useState('');

  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onEscape();
      }
    },
    [onEscape]
  );

  const onDragEnter = useCallback((event) => {
    event.preventDefault();
    setDropReady(true);
    setDropMessage('Drop to submit');
  }, []);
  const onDragLeave = useCallback(
    (event) => {
      setDropReady(false);
      setDropMessage(placeholder);
    },
    [placeholder]
  );

  const onDrop = useCallback(
    (event) => {
      setDropReady(false);
      const files = Array.from(event?.dataTransfer?.files);
      if (files?.length > 0) {
        submit(files);
        return;
      }

      const data =
        event?.dataTransfer?.getData('URL') ||
        event?.dataTransfer?.getData('Text') ||
        null;
      if (data) {
        submit(data);
        return;
      }
      if (event.target.value) {
        submit(event.target.value);
        return;
      }

      setTimeout(() => {
        submit(event.target.value);
      }, 100);
    },
    [submit]
  );
  return (
    <div
      tabIndex={0}
      role="region"
      aria-label="droppable area"
      onKeyDown={onKeyDown}
      style={
        {
          WebkitAppRegion: 'drag',
          WebkitUserSelect: 'none',
          minHeight: '4rem',
          width,
          height,
        } as any
      }
      className={`bg-transparent
      flex flex-col justify-center items-center
      dark:placeholder-white dark:placeholder-opacity-40 placeholder-black placeholder-opacity-40
      text-black dark:text-white text-xl
      focus:outline-none outline-none
      ring-0 ring-opacity-0 focus:ring-0 focus:ring-opacity-0 pl-4 py-0
      border-4 rounded border-gray-500 focus:border-gray-500 text-opacity-50 ${
        dropReady && `border-yellow-500 text-opacity-90 focus:border-yellow-500`
      }
`}
      placeholder={placeholder}
      ref={ref}
      onDragEnter={onDragEnter}
      onDragLeave={onDragLeave}
      onDragOver={(event) => event.preventDefault()}
      onDrop={onDrop}
    >
      <h2 className="pointer-events-none">{dropMessage || placeholder}</h2>
    </div>
  );
});
