import React from 'react';
import { KitPromptOptions } from '../types';

interface HeaderProps {
  scriptInfo: KitPromptOptions['scriptInfo'];
}

export default function Header({ scriptInfo }: HeaderProps) {
  return (
    <div className="text-xxs uppercase font-mono justify-between pt-3 px-4 grid grid-cols-5">
      <span className="dark:text-primary-light text-primary-dark col-span-3">
        {scriptInfo?.description || ''}
      </span>
      <span className="text-right col-span-2">
        {scriptInfo?.menu}
        {scriptInfo?.twitter && (
          <span>
            <span> - </span>
            <a href={`https://twitter.com/${scriptInfo?.twitter.slice(1)}`}>
              {scriptInfo?.twitter}
            </a>
          </span>
        )}
      </span>
    </div>
  );
}
