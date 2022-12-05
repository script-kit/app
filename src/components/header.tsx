/* eslint-disable jsx-a11y/no-static-element-interactions */
/* eslint-disable jsx-a11y/click-events-have-key-events */
/* eslint-disable no-nested-ternary */
import React, { useCallback } from 'react';
import { useAtom, useAtomValue } from 'jotai';
import { XIcon } from '@heroicons/react/outline';
import { AnimatePresence } from 'framer-motion';
import {
  _description,
  mouseEnabledAtom,
  nameAtom,
  openAtom,
  scriptAtom,
  logoAtom,
  processesAtom,
  isMainScriptAtom,
  runProcessesAtom,
  loadingAtom,
  kitStateAtom,
  applyUpdateAtom,
} from '../jotai';
import TopBar from './TopBar';

const TopLeftButton = () => {
  const name = useAtomValue(nameAtom);

  const isMainScript = useAtomValue(isMainScriptAtom);
  const processes = useAtomValue(processesAtom);

  const runProcesses = useAtomValue(runProcessesAtom);
  const applyUpdate = useAtomValue(applyUpdateAtom);
  const kitState = useAtomValue(kitStateAtom);

  const onProcessButtonClick = useCallback(() => {
    runProcesses();
  }, [processes, runProcesses]);

  const onUpdateButtonClick = useCallback(() => {
    applyUpdate();
  }, [applyUpdate]);

  if (kitState.updateDownloaded) {
    return (
      <button
        type="button"
        onClick={onUpdateButtonClick}
        // add the hand pointer cursor
        className="
        cursor-pointer -mr-2 -mt-0.5 flex flex-row items-center font-bold
        primary text-primary bg-text-base rounded-md bg-opacity-10
        hover:bg-opacity-20

        "
      >
        <span className="pl-2">Update</span>
        <i className="gg-play-button -ml-1.5 scale-75" some-aria="" />
      </button>
    );
  }

  if (isMainScript && processes?.length > 1) {
    return (
      <button
        type="button"
        onClick={onProcessButtonClick}
        className="cursor-pointer -mr-2 -mt-0.5 flex flex-row items-center font-bold primary text-primary text-opacity-90 bg-text-base rounded-md bg-opacity-10 hover:bg-opacity-20"
      >
        <span className="pl-2">{processes.length - 1}</span>
        <i className="gg-play-button -ml-1.5 scale-75" some-aria="" />
      </button>
    );
  }

  return <span className="truncate">{name}</span>;
};

export default function Header() {
  const [script] = useAtom(scriptAtom);
  const [mouseEnabled] = useAtom(mouseEnabledAtom);
  const [, setOpen] = useAtom(openAtom);
  const [description] = useAtom(_description);
  const [logo] = useAtom(logoAtom);
  const [name] = useAtom(nameAtom);
  const [processes] = useAtom(processesAtom);
  const [isMainScript] = useAtom(isMainScriptAtom);
  const [loading] = useAtom(loadingAtom);
  const [open] = useAtom(openAtom);

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
      className="flex flex-row justify-between w-full
      "
    >
      <AnimatePresence key="topBar">
        {open && loading && <TopBar />}
      </AnimatePresence>
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
      dark:text-base text-primary items-center ${
        isMainScript && processes?.length > 1 ? `-my-1` : ``
      }
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
          <TopLeftButton />

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
          text-primary dark:text-base
          hover:text-primary-black hover:dark:text-base
          "
          />
        </div>
      )}
    </div>
  );
}
