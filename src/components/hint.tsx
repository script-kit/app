import React from 'react';
import parse from 'html-react-parser';

import { useAtom } from 'jotai';
import { hintAtom } from '../jotai';

export default function Hint() {
  const [hint] = useAtom(hintAtom);

  return (
    <div className="px-4 py-1 text-xs text-gray-800 dark:text-gray-200 italic">
      {parse(hint)}
    </div>
  );
}
