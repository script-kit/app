/* eslint-disable jsx-a11y/click-events-have-key-events */
/* eslint-disable jsx-a11y/no-static-element-interactions */
import React, { useCallback, useEffect } from 'react';
import { gsap, Power0 } from 'gsap';
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

  useEffect(() => {
    gsap.fromTo(
      '#selected',
      {
        width: '10%',
      },
      {
        duration: 0.15,
        width: '100%',
      }
    );
  }, []);

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
pb-1
w-max
flex flex-row items-center
text-sm
border-b-2
text-primary text-opacity-90
border-primary
    hover:cursor-pointer
    `}
    >
      <div className="flex flex-row items-center justify-content hover:text-text-base font-semibold pl-3.5">
        <div className="mr-8 truncate flex flex-row h-[20px] max-h-[20px]">
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
