/* eslint-disable jsx-a11y/no-noninteractive-element-interactions */
/* eslint-disable jsx-a11y/no-static-element-interactions */
/* eslint-disable jsx-a11y/no-noninteractive-tabindex */
/* eslint-disable react/prop-types */
import React, {
  KeyboardEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';

interface DropProps {
  placeholder: string;
  submit(data: any): void;
  onEscape(): void;
  width: number;
  height: number;
  onDropHeightChanged: (height: number) => void;
}

export default function Drop({
  placeholder,
  submit,
  onEscape,
  width,
  height,
  onDropHeightChanged,
}: DropProps) {
  const containerRef = useRef<HTMLDivElement>(null);

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

  useEffect(() => {
    if (containerRef?.current) {
      const clientHeight = containerRef?.current?.clientHeight;
      onDropHeightChanged(clientHeight);
    }
  }, [onDropHeightChanged]);

  return (
    <div
      ref={containerRef}
      tabIndex={0}
      role="region"
      aria-label="droppable area"
      onKeyDown={onKeyDown}
      style={
        {
          WebkitAppRegion: 'drag',
          WebkitUserSelect: 'none',
          minHeight: '8rem',
          minWidth: '8rem',
          width,
          height,
        } as any
      }
      className={`
      drop-component
      flex flex-col justify-center items-center
      text-black dark:text-white text-xl
      focus:outline-none outline-none
      ring-0 ring-opacity-0 focus:ring-0 focus:ring-opacity-0
      bg-white dark:bg-black
      transition ease-in-out duration-200 ${
        dropReady ? `opacity-90` : `opacity-50`
      }


      px-20
      py-14
`}
      placeholder={placeholder}
      onDragEnter={onDragEnter}
      onDragLeave={onDragLeave}
      onDragOver={(event) => event.preventDefault()}
      onDrop={onDrop}
    >
      <h2 className="pointer-events-none mb-0">{dropMessage || placeholder}</h2>
    </div>
  );
}
