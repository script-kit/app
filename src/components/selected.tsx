/* eslint-disable jsx-a11y/click-events-have-key-events */
/* eslint-disable jsx-a11y/no-static-element-interactions */
import React, { useCallback } from 'react';
import { useAtom } from 'jotai';
import { ChevronLeftIcon } from '@heroicons/react/outline';

import { flagValueAtom, selectedAtom } from '../jotai';

export default function Selected() {
  const [flagValue, setFlagValue] = useAtom(flagValueAtom);
  const [selected] = useAtom(selectedAtom);

  const onClick = useCallback(
    (e) => {
      e.preventDefault();
      setFlagValue('');
    },
    [setFlagValue]
  );

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
flex flex-row items-center
text-xs
-mt-2  border-b-2
text-primary-dark dark:text-primary-light
border-primary-dark dark:border-primary-light
    hover:cursor-pointer
    `}
    >
      {flagValue ? (
        <div className="flex flex-row items-center justify-content hover:text-black dark:hover:text-white font-semibold">
          <i className="ml-1 gg-chevron-left scale-60" some-aria="" />
          {/* <ChevronLeftIcon className="ml-1 scale-60" /> */}
          <div className="mr-4">{selected}</div>
        </div>
      ) : (
        <div className="mx-4 py-1 font-mono">{selected}</div>
      )}
    </div>
  );
}
