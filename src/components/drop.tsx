/* eslint-disable react/prop-types */
import React, { forwardRef, useCallback, useState } from 'react';

import { DropProps } from '../types';

export default forwardRef<HTMLDivElement, DropProps>(function Drop(
  { placeholder, submit },
  ref
) {
  const [dropReady, setDropReady] = useState(false);
  const [dropMessage, setDropMessage] = useState(placeholder);

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
      style={
        {
          WebkitAppRegion: 'drag',
          WebkitUserSelect: 'none',
          minHeight: '4rem',
        } as any
      }
      className={`bg-transparent w-full text-black dark:text-white focus:outline-none outline-none text-xl dark:placeholder-white dark:placeholder-opacity-40 placeholder-black placeholder-opacity-40 h-16
  ring-0 ring-opacity-0 focus:ring-0 focus:ring-opacity-0 pl-4 py-0
  flex justify-center items-center
  border-dashed border-4 rounded border-gray-500 focus:border-gray-500 text-opacity-50 ${
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
      <h2 className="pointer-events-none">{dropMessage}</h2>
    </div>
  );
});
