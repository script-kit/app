/* eslint-disable jsx-a11y/no-noninteractive-element-interactions */
/* eslint-disable jsx-a11y/no-static-element-interactions */
/* eslint-disable jsx-a11y/no-noninteractive-tabindex */
/* eslint-disable react/prop-types */

import React, { KeyboardEvent, useCallback, useRef, useState } from 'react';
import useMountHeight from './hooks/useMountHeight';

interface DropProps {
  placeholder: string;
  submit(data: any): void;
  onEscape(): void;
}

export default function Drop({ placeholder, submit, onEscape }: DropProps) {
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

  const containerRef = useMountHeight();

  return (
    <div ref={containerRef}>
      <div
        tabIndex={0}
        role="region"
        aria-label="droppable area"
        onKeyDown={onKeyDown}
        style={
          {
            WebkitAppRegion: 'drag',
            WebkitUserSelect: 'none',
          } as any
        }
        className={`
        min-h-64 w-full h-full
        drop-component
        flex flex-col justify-center items-center
        text-black dark:text-white text-xl
        focus:outline-none outline-none
        ring-0 ring-opacity-0 focus:ring-0 focus:ring-opacity-0
        bg-white dark:bg-black
        transition ease-in-out duration-200 ${
          dropReady ? `opacity-75` : `opacity-25`
        }
        w-full h-52
      `}
        placeholder={placeholder}
        onDragEnter={onDragEnter}
        onDragLeave={onDragLeave}
        onDragOver={(event) => event.preventDefault()}
        onDrop={onDrop}
      >
        <h2 className="pointer-events-none mb-0">
          {dropMessage || placeholder}
        </h2>
      </div>
    </div>
  );
}
