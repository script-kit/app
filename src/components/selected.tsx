/* eslint-disable jsx-a11y/click-events-have-key-events */
/* eslint-disable jsx-a11y/no-static-element-interactions */
import React, { useCallback } from 'react';
import { Choice } from 'kit-bridge/cjs/type';
import { useAtom } from 'jotai';

import { ReactComponent as MoreThanIcon } from '../svg/icons8-more-than.svg';
import { flagValueAtom } from '../jotai';

export default function Selected() {
  const [flagValue, setFlagValue] = useAtom(flagValueAtom);

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
    py-1
    cursor-pointer
    text-sm
    primary-invert
    flex flex-row
    items-center
    `}
    >
      <div className="px-2 hover:cursor-pointer">
        <MoreThanIcon
          className={`
h-2 w-2
fill-current
transition ease-in
opacity-75
hover:opacity-100
text-white dark:text-black
`}
          viewBox="0 0 32 32"
          transform="rotate(180)"
        />
      </div>
      {typeof flagValue === 'string' ? flagValue : (flagValue as Choice).name}
    </div>
  );
}
