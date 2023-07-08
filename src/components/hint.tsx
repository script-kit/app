import React from 'react';
import parse from 'html-react-parser';
import { useAtom } from 'jotai';
import { hintAtom } from '../jotai';

export default function Hint() {
  const [hint] = useAtom(hintAtom);

  return (
    <div
      id="hint"
      key="hint"
      className="px-4 py-2 text-sm font-medium
      text-primary
      "
    >
      {parse(hint)}
    </div>
  );
}
