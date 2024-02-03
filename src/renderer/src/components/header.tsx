/* eslint-disable react-hooks/exhaustive-deps */
/* eslint-disable react/function-component-definition */
/* eslint-disable jsx-a11y/no-static-element-interactions */
/* eslint-disable jsx-a11y/click-events-have-key-events */
/* eslint-disable no-nested-ternary */
import React, { useCallback } from 'react';
import { useAtom, useAtomValue } from 'jotai';
import { XIcon } from '@heroicons/react/outline';
import {
  descriptionAtom,
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
  promptDataAtom,
  socialAtom,
} from '../jotai';

const TopRightButton = () => {
  const name = useAtomValue(nameAtom);

  const isMainScript = useAtomValue(isMainScriptAtom);
  const processes = useAtomValue(processesAtom);

  const runProcesses = useAtomValue(runProcessesAtom);
  const applyUpdate = useAtomValue(applyUpdateAtom);
  const kitState = useAtomValue(kitStateAtom);
  const social = useAtomValue(socialAtom);

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
        key="update"
        onClick={onUpdateButtonClick}
        tabIndex={-1}
        // add the hand pointer cursor
        className="
        primary -mr-2 -mt-0.5 flex cursor-pointer flex-row items-center
        rounded-md bg-text-base bg-opacity-10 font-bold text-primary
        hover:bg-opacity-20

        "
      >
        <span className="pl-2">Update</span>
        <i className="gg-play-button -ml-1.5 scale-75" />
      </button>
    );
  }

  if (isMainScript && processes?.length > 1) {
    return (
      <button
      key="process"
        type="button"
        tabIndex={-1}
        onClick={onProcessButtonClick}
        className="primary -mr-2 -mt-0.5 flex cursor-pointer flex-row items-center rounded-md bg-text-base bg-opacity-10 font-bold text-primary text-opacity-90 hover:bg-opacity-20"
      >
        <span className="pl-2">{processes.length - 1}</span>
        <i className="gg-play-button -ml-1.5 scale-75" />
      </button>
    );
  }

  return (
    <>
      <span
        style={{
          WebkitAppRegion: 'drag',
          WebkitUserSelect: 'none',
        }}
        className="truncate"
      >
        {name}
      </span>

      {social && (
        <span>
          <span>&nbsp;-&nbsp;</span>
          <a href={social.url}>{social.username}</a>
        </span>
      )}
    </>
  );
};

export default function Header() {
  const [script] = useAtom(scriptAtom);
  const [mouseEnabled] = useAtom(mouseEnabledAtom);
  const [, setOpen] = useAtom(openAtom);
  const [description] = useAtom(descriptionAtom);
  const [logo] = useAtom(logoAtom);
  const [name] = useAtom(nameAtom);
  const [processes] = useAtom(processesAtom);
  const [isMainScript] = useAtom(isMainScriptAtom);
  const [loading] = useAtom(loadingAtom);
  const [open] = useAtom(openAtom);
  const [promptData] = useAtom(promptDataAtom);

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
      className="flex w-full flex-row justify-between
      "
    >
      <div
        className={`
        flex
      w-full flex-row items-center px-4 pt-3 font-mono text-xxs font-bold
      uppercase text-primary ${
        isMainScript && processes?.length > 1 ? `-my-1` : ``
      }
      ${promptData?.headerClassName || ''}
      `}
      >
        <div
          style={{
            WebkitAppRegion: 'drag',
            WebkitUserSelect: 'none',
          }}
          className="flex flex-row"
        >
          {logo ? (
            <img src={logo} alt={name} className="h-4 pr-2" />
          ) : (
            <span className="truncate pr-1">{description}</span>
          )}
        </div>
        <div
          style={{
            WebkitAppRegion: 'drag',
            WebkitUserSelect: 'none',
          }}
          className="-mt-4 h-full flex-1"
        />
        <span className="flex flex-row items-end pl-1 text-right">
          <TopRightButton key='top-right-button' />
        </span>
      </div>
      {false && mouseEnabled && (
        <div onClick={onXClick} className="h-6 w-6 hover:cursor-pointer">
          <XIcon
            className="hover:text-primary-black absolute
          top-0 right-0 m-1.5
          h-3
          w-3
          text-primary
          "
          />
        </div>
      )}
    </div>
  );
}
