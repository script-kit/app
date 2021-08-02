/* eslint-disable jsx-a11y/click-events-have-key-events */
/* eslint-disable jsx-a11y/no-static-element-interactions */
import React, { useCallback } from 'react';
import { Choice } from 'kit-bridge/cjs/type';

import { useAtom } from 'jotai';
import { flagValueAtom, hintAtom } from '../jotai';

export default function Hint() {
  const [flagValue, setFlagValue] = useAtom(flagValueAtom);

  const onClick = useCallback(() => {
    setFlagValue('');
  }, [setFlagValue]);

  return (
    <div
      style={
        {
          WebkitAppRegion: 'no-drag',
          WebkitUserSelect: 'none',
        } as any
      }
      onClick={onClick}
      className={`
    pl-3 py-1
      cursor-pointer
    text-md font-mono font-bold
    text-white dark:text-black
    dark:bg-primary-light bg-primary-dark
    hover:shadow-lg shadow-inner

    `}
    >
      {`< ${
        typeof flagValue === 'string' ? flagValue : (flagValue as Choice).name
      }`}
    </div>
  );
}
