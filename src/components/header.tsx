/* eslint-disable jsx-a11y/no-static-element-interactions */
/* eslint-disable jsx-a11y/click-events-have-key-events */
/* eslint-disable no-nested-ternary */
import React, { useCallback } from 'react';
import { useAtom } from 'jotai';
import { XIcon } from '@heroicons/react/outline';
import {
  _description,
  mouseEnabledAtom,
  _name,
  openAtom,
  scriptAtom,
  _logo,
} from '../jotai';
import TopBar from './TopBar';

export default function Header() {
  const [script] = useAtom(scriptAtom);
  const [mouseEnabled] = useAtom(mouseEnabledAtom);
  const [, setOpen] = useAtom(openAtom);
  const [description] = useAtom(_description);
  const [logo] = useAtom(_logo);
  const [name] = useAtom(_name);

  const onXClick = useCallback(() => {
    setOpen(false);
  }, [setOpen]);

  return (
    <div
      style={
        {
          WebkitAppRegion: 'no-drag',
          WebkitUserSelect: 'none',
        } as any
      }
      className="flex flex-row justify-between w-full"
    >
      <TopBar />
      <div
        style={
          {
            WebkitAppRegion: 'drag',
            WebkitUserSelect: 'none',
          } as any
        }
        className={`
        w-full
      text-xxs uppercase font-mono font-bold justify-between pt-3 px-4 flex flex-row
      dark:text-white text-primary-dark items-center
      `}
      >
        <div className="flex flex-row">
          {logo ? (
            <img src={logo} alt={name} className="h-4 pr-2 dark:invert" />
          ) : (
            <span className="pr-1 truncate">{description}</span>
          )}
        </div>
        <span className="flex flex-row items-end pl-1 text-right">
          <span className="truncate">{name}</span>

          {script?.twitter && (
            <span>
              <span>&nbsp;-&nbsp;</span>
              <a href={`https://twitter.com/${script?.twitter.slice(1)}`}>
                {script?.twitter}
              </a>
            </span>
          )}
        </span>
      </div>
      {false && mouseEnabled && (
        <div onClick={onXClick} className="w-6 h-6 hover:cursor-pointer">
          <XIcon
            className="h-3 w-3
          absolute top-0 right-0
          m-1.5
          text-primary-dark dark:text-primary-light
          hover:text-primary-black hover:dark:text-primary-light
          "
          />
        </div>
      )}
    </div>
  );
}
