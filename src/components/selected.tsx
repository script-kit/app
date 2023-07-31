/* eslint-disable jsx-a11y/click-events-have-key-events */
/* eslint-disable jsx-a11y/no-static-element-interactions */
import React, { useCallback } from 'react';
import { useAtom } from 'jotai';
import { flagValueAtom, selectedAtom } from '../jotai';
import { IconSwapper } from './iconswapper';

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
      id="selected"
      key="selected"
      style={
        {
          WebkitAppRegion: 'no-drag',
          WebkitUserSelect: 'none',
        } as any
      }
      onClick={onClick}
      className={`
flex
w-full
flex-row items-center border-b-2
border-primary
pb-[3px]
text-sm text-primary
text-opacity-90
    hover:cursor-pointer
    `}
    >
      <div className="justify-content flex flex-row items-center pl-3.5 font-semibold hover:text-text-base">
        <div className="mr-8 flex h-5 flex-row truncate">
          <div className="">
            <IconSwapper text="←" />
          </div>
          <span className="ml-1.5" />
          {/* {'←'} */}
          <span className="">{selected}</span>
        </div>
      </div>
    </div>
  );
}
