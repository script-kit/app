/* eslint-disable jsx-a11y/no-noninteractive-element-interactions */
/* eslint-disable jsx-a11y/no-static-element-interactions */
/* eslint-disable jsx-a11y/no-noninteractive-tabindex */
/* eslint-disable react/prop-types */

import { useAtom } from 'jotai';
import { UI } from '@johnlindquist/kit/cjs/enum';
import SimpleBar from 'simplebar-react';
import React, { useCallback, useState } from 'react';
import {
  closedDiv,
  placeholderAtom,
  previewHTMLAtom,
  submitValueAtom,
} from '../jotai';
import { useEscape, useMountMainHeight } from '../hooks';

export default function Drop() {
  // useEscape();

  const [dropReady, setDropReady] = useState(false);
  const [dropMessage, setDropMessage] = useState('');

  const [placeholder] = useAtom(placeholderAtom);
  const [, submit] = useAtom(submitValueAtom);
  const [previewHTML] = useAtom(previewHTMLAtom);

  const hasPreview = Boolean(previewHTML && previewHTML !== closedDiv);

  const onDragEnter = useCallback((event) => {
    // TODO: Check this on windows
    // event.preventDefault();
    setDropReady(true);
    setDropMessage('Drop to Submit');
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

  const containerRef = useMountMainHeight();

  return (
    <div
      id={UI.drop}
      ref={containerRef}
      className="flex flex-row min-w-full min-h-full h-full"
    >
      <div
        tabIndex={0}
        role="region"
        aria-label="droppable area"
        style={
          {
            WebkitUserSelect: 'none',
          } as any
        }
        className={`
          ${hasPreview ? `w-[300px] mt-16` : `w-full justify-center`}
        h-full
        drop-component
        flex flex-col  items-center
        text-text-base  text-xl
        focus:outline-none outline-none
        ring-0 ring-opacity-0 focus:ring-0 focus:ring-opacity-0
        transition ease-in-out duration-500 ${
          dropReady ? `opacity-75 shadow-inner` : `opacity-25`
        }
      `}
        placeholder={placeholder}
        onDragEnter={onDragEnter}
        onDragLeave={onDragLeave}
        onDragOver={(event) => {
          event.preventDefault();
          event.stopPropagation();
        }}
        onDrop={onDrop}
      >
        <h2 className="pointer-events-none mb-0 text-4xl">
          {dropMessage || placeholder}
        </h2>
      </div>
    </div>
  );
}
