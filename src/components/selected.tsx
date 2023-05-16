/* eslint-disable jsx-a11y/click-events-have-key-events */
/* eslint-disable jsx-a11y/no-static-element-interactions */
import React, { useCallback } from 'react';
import { useAtom } from 'jotai';
import { motion } from 'framer-motion';
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
    <motion.div
      key="selected"
      layout="size"
      initial={{ opacity: 1, width: '10%' }}
      animate={{ opacity: 1, width: '100%' }}
      exit={{ opacity: 0, width: '10t%' }}
      transition={{ duration: 0.15, ease: 'easeIn' }}
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
      {flagValue ? (
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
      ) : (
        <div className="mx-4 py-1 font-mono truncate">{selected}</div>
      )}
    </motion.div>
  );
}
