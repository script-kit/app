/* eslint-disable jsx-a11y/no-static-element-interactions */
/* eslint-disable jsx-a11y/click-events-have-key-events */
/* eslint-disable jsx-a11y/mouse-events-have-key-events */
/* eslint-disable react/no-array-index-key */
/* eslint-disable no-nested-ternary */
import React, { useCallback, useState } from 'react';
import parse from 'html-react-parser';
import { overrideTailwindClasses } from 'tailwind-override';
import { friendlyShortcut } from 'kit-bridge/cjs/util';
import { useAtom } from 'jotai';
import { ChoiceButtonProps } from '../types';
import { flagsAtom, flagValueAtom } from '../jotai';
import { ReactComponent as MoreThanIcon } from '../svg/icons8-more-than.svg';

export default function ChoiceButton({
  data,
  index,
  style,
}: ChoiceButtonProps) {
  const { choices, currentIndex, mouseEnabled, onIndexChange, onIndexSubmit } =
    data;
  const choice = choices[index];

  const [mouseDown, setMouseDown] = useState(false);
  const [flags] = useAtom(flagsAtom);
  const [flaggedValue, setFlagValue] = useAtom(flagValueAtom);

  const onRightClick = useCallback(
    (event) => {
      event.preventDefault();
      event.stopPropagation();
      setFlagValue(choice);
    },
    [choice, setFlagValue]
  );

  return (
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events
    <button
      type="button"
      onContextMenu={onRightClick}
      onMouseDown={() => setMouseDown(true)}
      onMouseUp={() => setMouseDown(false)}
      style={style}
      className={`  ${
        index === currentIndex
          ? `dark:bg-white dark:bg-opacity-5 bg-white bg-opacity-50
            ${
              mouseDown
                ? `shadow-sm bg-opacity-25`
                : `shadow-lg hover:shadow-xl`
            }
            `
          : ``
      } ${overrideTailwindClasses(`
        w-full
        h-16
        flex-shrink-0
        whitespace-nowrap
        text-left
        flex
        flex-row
        text-lg
        pl-4
        pr-2
        justify-between
        items-center
        focus:outline-none
        transition-shadow ease-in-out duration-200
        ${choice?.className}
      `)}`}
      onClick={(_event) => {
        onIndexSubmit(index);
      }}
      // onContextMenu={editScript}
      onMouseOver={() => {
        if (mouseEnabled) {
          onIndexChange(index);
        }
      }}
    >
      {choice?.html ? (
        parse(choice?.html, {
          replace: (domNode: any) => {
            if (domNode?.attribs && index === currentIndex)
              domNode.attribs.class = 'focused';
            return domNode;
          },
        })
      ) : (
        <div className="flex flex-row h-full w-full justify-between items-center">
          <div className="flex flex-col max-w-full overflow-x-hidden">
            <div className="truncate">{choice.name}</div>
            {(choice?.focused || choice?.description) && (
              <div
                className={`text-xs truncate transition-opacity ease-in-out duration-500 pb-1 ${
                  index === currentIndex
                    ? `opacity-90 dark:text-primary-light text-primary-dark`
                    : `opacity-60`
                }
                hover:opacity-100
                `}
              >
                {(index === currentIndex && choice?.description) ||
                  choice?.description}
              </div>
            )}
          </div>

          <div className="flex flex-row items-center h-full">
            <div className="flex flex-col">
              {choice?.shortcut && (
                <div
                  className={`
              text-xxs font-mono font-bold
              ${index === currentIndex ? `opacity-70` : `opacity-40`}
              `}
                >
                  {friendlyShortcut(choice.shortcut)}
                </div>
              )}
              {choice?.tag && (
                <div
                  className={`
              text-xxs font-mono font-bold
              ${index === currentIndex ? `opacity-70` : `opacity-40`}
              `}
                >
                  {choice.tag}
                </div>
              )}
            </div>
            {choice?.icon && (
              <img
                alt="icon"
                className={`
                border-2 border-black dark:border-white border-opacity-50
                rounded-full
                w-6 h-6
                `}
                src={choice?.icon}
              />
            )}
            {choice?.img && (
              <img
                src={choice.img}
                alt={choice.description || ''}
                className="py-2 h-full"
              />
            )}

            {index === currentIndex && flags && !flaggedValue && (
              <div className="pl-2 hover:cursor-pointer" onClick={onRightClick}>
                <MoreThanIcon
                  className={`
        h-4 w-3
        fill-current
        transition ease-in
        opacity-25
        hover:opacity-100
        dark:text-white text-black
        `}
                  viewBox="0 0 32 32"
                />
              </div>
            )}
          </div>
        </div>
      )}
    </button>
  );
}
