/* eslint-disable jsx-a11y/no-static-element-interactions */
/* eslint-disable jsx-a11y/click-events-have-key-events */
/* eslint-disable no-nested-ternary */
import React, { useCallback } from 'react';
import { useAtom } from 'jotai';
import { XIcon } from '@heroicons/react/outline';
import {
  choicesAtom,
  darkAtom,
  descriptionAtom,
  isMouseDownAtom,
  mainHeightAtom,
  mouseEnabledAtom,
  nameAtom,
  openAtom,
  panelHTMLAtom,
  promptDataAtom,
  scriptAtom,
  selectedAtom,
  topHeightAtom,
  uiAtom,
  unfilteredChoicesAtom,
} from '../jotai';

export default function Header() {
  const [script] = useAtom(scriptAtom);
  const [mainHeight] = useAtom(mainHeightAtom);
  const [topHeight] = useAtom(topHeightAtom);
  const [panelHTML] = useAtom(panelHTMLAtom);
  const [ui] = useAtom(uiAtom);
  const [mouseEnabled] = useAtom(mouseEnabledAtom);
  const [mouseDown] = useAtom(isMouseDownAtom);
  const [unfilteredChoices] = useAtom(unfilteredChoicesAtom);
  const [choices] = useAtom(choicesAtom);
  const [selected] = useAtom(selectedAtom);
  const [dark] = useAtom(darkAtom);
  const [promptData] = useAtom(promptDataAtom);
  const [, setOpen] = useAtom(openAtom);
  const [description] = useAtom(descriptionAtom);
  const [name] = useAtom(nameAtom);

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
      <div
        style={
          {
            WebkitAppRegion: 'drag',
            WebkitUserSelect: 'none',
          } as any
        }
        className={`
        w-full
      transition duration-1000
      text-xxs uppercase font-mono font-bold justify-between pt-3 px-4 flex flex-row
      dark:text-white text-primary-dark
      `}
      >
        <span className="pr-1">
          {description}
          {/* {promptData?.ignoreBlur && 'Ignore Blur'} */}
          {/* {mouseEnabled ? 'enabled' : 'disabled'} */}
          {/* {dark ? 'Dark' : 'Light'} */}
          {/* {unfilteredChoices.length} : {choices.length} */}
          {/* {topHeight},{mainHeight},{maxHeight},{panelHTML?.length},{ui} */}
          {/* {mouseDown ? `Mouse down` : `up`} */}
        </span>
        {/* <span className="dark:text-primary-light text-primary-dark col-span-3">
          {`top: ${topHeight} - main: ${mainHeight} - max: ${maxHeight} -`}
        </span> */}
        <span className="flex flex-col items-end pl-1 text-right">
          <span>{name}</span>
          <span>
            {script?.twitter && (
              <a href={`https://twitter.com/${script?.twitter.slice(1)}`}>
                {script?.twitter}
              </a>
            )}
          </span>
        </span>
      </div>
      {false && promptData?.ignoreBlur && mouseEnabled && (
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
