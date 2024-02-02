/* eslint-disable jsx-a11y/no-noninteractive-element-interactions */
/* eslint-disable jsx-a11y/no-static-element-interactions */
/* eslint-disable jsx-a11y/no-noninteractive-tabindex */
/* eslint-disable react/prop-types */

import { useAtom, useAtomValue } from 'jotai';
import { UI } from '@johnlindquist/kit/core/enum';
import React, { useCallback, useState } from 'react';
import {
  placeholderAtom,
  previewEnabledAtom,
  previewHTMLAtom,
  submitValueAtom,
  previewCheckAtom,
} from '../jotai';

export default function Drop() {
  // useEscape();

  const [dropReady, setDropReady] = useState(false);
  const [dropMessage, setDropMessage] = useState('');

  const [placeholder] = useAtom(placeholderAtom);
  const [, submit] = useAtom(submitValueAtom);
  const [previewHTML] = useAtom(previewHTMLAtom);
  const previewEnabled = useAtomValue(previewEnabledAtom);

  const hasPreview = useAtomValue(previewCheckAtom);

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

  return (
    <div id={UI.drop} className="flex h-full min-h-full min-w-full flex-row">
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
          w-full ${hasPreview ? `mt-16 p-2` : `justify-center p-8`}
        drop-component
        flex
        h-full flex-col  items-center
        text-xl  text-text-base
        outline-none ring-0
        ring-opacity-0 transition duration-500 ease-in-out
        focus:outline-none focus:ring-0 focus:ring-opacity-0 ${
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
