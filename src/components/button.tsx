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

  const onMouseDown = useCallback((e) => {
    e.preventDefault();
    setMouseDown(true);
  }, []);
  const onMouseUp = useCallback((e) => {
    e.preventDefault();
    setMouseDown(false);
  }, []);
  const onClick = useCallback(
    (e) => {
      e.preventDefault();
      onIndexSubmit(index);
    },
    [index, onIndexSubmit]
  );
  const onMouseOver = useCallback(
    (e) => {
      e.preventDefault();
      if (mouseEnabled) {
        onIndexChange(index);
      }
    },
    [index, mouseEnabled, onIndexChange]
  );

  return (
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events
    <button
      type="button"
      onContextMenu={onRightClick}
      onMouseDown={onMouseDown}
      onMouseUp={onMouseUp}
      style={{
        cursor: mouseEnabled > 10 ? 'pointer' : 'none',
        ...style,
      }}
      className={`

      ${
        index === currentIndex
          ? `dark:bg-white dark:bg-opacity-5 bg-white bg-opacity-20 choice
            ${
              mouseDown
                ? `shadow-sm bg-opacity-25`
                : `shadow-md hover:shadow-lg`
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

        px-4

        justify-between
        items-center
        focus:outline-none
        transition-shadow ease-in-out duration-200
        ${choice?.className}
        ${index === currentIndex ? `opacity-100` : `opacity-90`}
      `)}`}
      onClick={onClick}
      // onContextMenu={editScript}
      onMouseOver={onMouseOver}
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
        <div className="flex flex-row items-center justify-between w-full h-full">
          <div className="flex flex-col max-w-full overflow-x-hidden">
            <div className="truncate">{choice.name}</div>
            {(choice?.focused || choice?.description) && (
              <div
                className={`text-xs truncate transition-opacity ease-in-out duration-500 pb-1 ${
                  index === currentIndex
                    ? `opacity-90 dark:text-primary-light text-primary-dark`
                    : `opacity-60`
                }

                `}
              >
                {(index === currentIndex && choice?.description) ||
                  choice?.description}
              </div>
            )}
          </div>

          <div className="flex flex-row items-center flex-shrink-0 h-full">
            <div className="flex flex-col px-2">
              {choice?.shortcut && (
                <div
                  className={`
              text-xxs font-mono
              ${index === currentIndex ? `opacity-70` : `opacity-40`}
              `}
                >
                  {friendlyShortcut(choice.shortcut)}
                </div>
              )}
              {choice?.kenv && (
                <div
                  className={`
              text-xxs font-mono
              ${index === currentIndex ? `opacity-70` : `opacity-40`}
              `}
                >
                  {choice.kenv}
                </div>
              )}
              {choice?.tag && (
                <div
                  className={`
              text-xxs font-mono
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
                w-12
                `}
                src={choice?.icon}
              />
            )}
            {choice?.img && (
              <img
                src={choice.img}
                alt={choice.description || ''}
                className={`
                h-3/4 rounded
                ${index === currentIndex ? `opacity-100` : `opacity-80`}

              }


              transition ease-in
                `}
              />
            )}

            {index === currentIndex &&
              Boolean(Object.keys(flags).length) &&
              !flaggedValue && (
                <div onClick={onRightClick}>
                  <MoreThanIcon
                    className={`
        h-4 w-3 ml-2
        fill-current
        transition ease-in
        opacity-50
        hover:opacity-80
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
