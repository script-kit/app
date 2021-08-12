/* eslint-disable jsx-a11y/click-events-have-key-events */
/* eslint-disable jsx-a11y/no-static-element-interactions */
import React, { useCallback } from 'react';
import { Choice } from 'kit-bridge/cjs/type';
import { useAtom } from 'jotai';

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
    font-semibold
    `}
    >
      {flagValue ? (
        <div className="flex flex-row items-center justify-content hover:text-black dark:hover:text-white">
          <i className="ml-1 gg-chevron-left scale-[50%] " some-aria="" />
          <div className="">{selected}</div>
        </div>
      ) : (
        <div className="px-4 py-1">{selected}</div>
      )}
    </div>
  );
}
