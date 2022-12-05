/* eslint-disable jsx-a11y/click-events-have-key-events */
/* eslint-disable jsx-a11y/no-static-element-interactions */
import React, { useCallback } from 'react';
import { useAtom } from 'jotai';
import { motion } from 'framer-motion';
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
    <motion.div
      key="selected"
      layout="size"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1, width: '100%' }}
      transition={{ duration: 0.2 }}
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
border-primary border-opacity-0
    hover:cursor-pointer
    `}
    >
      {flagValue ? (
        <div className="flex flex-row items-center justify-content hover:text-text-base dark:hover:text-white font-semibold pl-3.5">
          <div className="mr-8 truncate">← {selected}</div>
        </div>
      ) : (
        <div className="mx-4 py-1 font-mono truncate">{selected}</div>
      )}
    </motion.div>
  );
}
