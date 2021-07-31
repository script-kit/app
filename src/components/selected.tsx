import React from 'react';
import { Choice } from 'kit-bridge/cjs/type';

import { useAtom } from 'jotai';
import { flagValueAtom, hintAtom } from '../jotai';

export default function Hint() {
  const [flagValue] = useAtom(flagValueAtom);

  return (
    <div
      className={`
    pl-3 py-1
    text-md text-primary-dark dark:text-primary-light font-mono
    border-l-8 border-primary-dark dark:border-primary-dark
    `}
    >
      {`${
        typeof flagValue === 'string' ? flagValue : (flagValue as Choice).name
      }`}
    </div>
  );
}
