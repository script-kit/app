import React from 'react';
import { Script } from 'kit-bridge/cjs/type';

interface HeaderProps {
  script: Script;
  pid: number;
}

export default function Header({ script, pid }: HeaderProps) {
  return (
    <div className="text-xxs uppercase font-mono font-bold justify-between pt-3 px-4 grid grid-cols-5">
      <span className="dark:text-primary-light text-primary-dark col-span-3">
        {script?.description || ''}
      </span>
      <span className="text-right col-span-2">
        {script?.menu}
        {script?.twitter && (
          <span>
            <span> - </span>
            <a href={`https://twitter.com/${script?.twitter.slice(1)}`}>
              {script?.twitter}
            </a>
          </span>
        )}
      </span>
    </div>
  );
}
