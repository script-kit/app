/* eslint-disable react/jsx-props-no-spreading */
/* eslint-disable no-restricted-syntax */
/* eslint-disable jsx-a11y/no-static-element-interactions */
/* eslint-disable jsx-a11y/click-events-have-key-events */
/* eslint-disable jsx-a11y/mouse-events-have-key-events */
/* eslint-disable react/no-array-index-key */
/* eslint-disable no-nested-ternary */
import React, { useCallback, useEffect, useState } from 'react';
import parse from 'html-react-parser';

import { overrideTailwindClasses } from 'tailwind-override';
import { Choice, Script } from 'kit-bridge/cjs/type';
import { useAtom } from 'jotai';
import { ipcRenderer } from 'electron';
import { ChoiceButtonProps } from '../types';
import { flagsAtom, flagValueAtom, isMouseDownAtom } from '../jotai';
import { ReactComponent as MoreThanIcon } from '../svg/icons8-more-than.svg';
import { ReactComponent as NoImageIcon } from '../svg/icons8-no-image.svg';
import { AppChannel } from '../enums';

function highlight(
  string: string,
  matches: [number, number][],
  className: string
) {
  const substrings = [];
  let previousEnd = 0;

  if (matches?.length) {
    for (const [start, end] of matches) {
      const prefix = string.substring(previousEnd, start);
      const match = (
        <mark className={className}>{string.substring(start, end)}</mark>
      );

      substrings.push(prefix, match);
      previousEnd = end;
    }
  }
  substrings.push(string.substring(previousEnd));

  return <span>{React.Children.toArray(substrings)}</span>;
}

function isScript(choice: Choice | Script): choice is Script {
  return (choice as Script)?.command !== undefined;
}

export default function ChoiceButton({
  data,
  index,
  style,
}: ChoiceButtonProps) {
  const { choices, currentIndex, mouseEnabled, onIndexChange, onIndexSubmit } =
    data;
  const scoredChoice = choices[index];
  const choice: Choice | Script = scoredChoice?.item || scoredChoice;

  const [isMouseDown, setIsMouseDown] = useAtom(isMouseDownAtom);
  const [flags] = useAtom(flagsAtom);
  const [flaggedValue, setFlagValue] = useAtom(flagValueAtom);
  // const dataTransfer = useRef<any>('Data Transfer');

  const onRightClick = useCallback(
    (event) => {
      event.preventDefault();
      event.stopPropagation();
      setFlagValue(choice);
    },
    [choice, setFlagValue]
  );

  const onClick = useCallback(
    (e) => {
      e.preventDefault();
      onIndexSubmit(index);
    },
    [index, onIndexSubmit]
  );
  const onMouseOver = useCallback(
    (e) => {
      if (mouseEnabled) {
        onIndexChange(index);
      }
    },
    [index, mouseEnabled, onIndexChange]
  );

  const [imageFail, setImageFail] = useState(false);

  useEffect(() => {
    setImageFail(false);
  }, [choice]);

  const onDragStart = useCallback(
    async (event: DragEvent) => {
      if (choice?.drag) {
        const drag = choice?.drag;
        if (typeof drag === 'string') {
          event.preventDefault();

          ipcRenderer.send(AppChannel.DRAG_FILE_PATH, {
            filePath: drag,
            icon: '',
          });
        } else {
          // const domString = `text/plain:script.js:${URL.createObjectURL(
          //   new Blob([dragContents as string], {
          //     type: 'text/plain;charset=utf-8',
          //   })
          // )}`;
          event.dataTransfer?.setData(
            drag?.format || 'text/plain',
            drag?.data || `please set drag.data`
          );
        }
      }
    },
    [choice]
  );

  return (
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events
    <button
      type="button"
      {...(choice?.drag
        ? {
            draggable: true,
            onDragStart,
          }
        : {})}
      onContextMenu={onRightClick}
      style={{
        cursor: mouseEnabled
          ? choice?.drag
            ? isMouseDown
              ? 'grabbing'
              : 'grab'
            : 'pointer'
          : 'none',
        ...style,
      }}
      className={`

      ${
        index === currentIndex
          ? `bg-black bg-opacity-10
          dark:bg-white dark:bg-opacity-5
            ${
              mouseEnabled
                ? isMouseDown
                  ? `shadow-inner bg-opacity-15 dark:bg-opacity-10`
                  : `shadow hover:shadow-md`
                : ``
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
            <div className="truncate">
              {highlight(
                choice.name,
                scoredChoice?.matches?.name,
                'bg-white bg-opacity-0 text-primary-dark dark:text-primary-light'
              )}
            </div>
            {(choice?.focused || choice?.description) && (
              <div
                className={`text-xs truncate transition-opacity ease-in-out duration-200 pb-1 ${
                  index === currentIndex
                    ? `opacity-90 dark:text-primary-light text-primary-dark`
                    : `opacity-60`
                }

                `}
              >
                {highlight(
                  choice?.description || '',
                  scoredChoice?.matches?.description,
                  'bg-white bg-opacity-0 text-primary-dark dark:text-primary-light  text-opacity-100'
                )}
              </div>
            )}
          </div>

          <div className="flex flex-row items-center flex-shrink-0 h-full">
            {!isScript(choice) && (choice?.tag || choice?.icon) && (
              <div className="flex flex-row items-center">
                {choice?.tag && (
                  <div
                    className={`
              text-xxs font-mono mx-1
              ${index === currentIndex ? `opacity-70` : `opacity-40`}
              `}
                  >
                    {choice.tag}
                  </div>
                )}

                {choice?.icon && (
                  <img
                    alt="icon"
                    className={`
    border-2 border-black dark:border-white border-opacity-50
    rounded-full
    h-6 mx-1
    `}
                    src={choice?.icon}
                  />
                )}
              </div>
            )}

            {isScript(choice) && (choice?.friendlyShortcut || choice?.kenv) && (
              <div className="flex flex-col px-2">
                {choice?.friendlyShortcut && (
                  <div
                    className={`
              text-xxs font-mono
              ${index === currentIndex ? `opacity-70` : `opacity-40`}
              `}
                  >
                    {highlight(
                      choice.friendlyShortcut,
                      scoredChoice?.matches?.friendlyShortcut,
                      'bg-white bg-opacity-0 text-primary-dark dark:text-primary-light text-opacity-100'
                    )}
                  </div>
                )}
                {choice?.kenv && (
                  <div
                    className={`
              text-xxs font-mono
              ${index === currentIndex ? `opacity-70` : `opacity-40`}
              `}
                  >
                    {highlight(
                      choice.kenv,
                      scoredChoice?.matches?.kenv,
                      'bg-white bg-opacity-0 text-primary-dark dark:text-primary-light'
                    )}
                  </div>
                )}
              </div>
            )}
            {imageFail && (
              <div
                style={{ aspectRatio: '1/1' }}
                className="h-3/4 flex flex-row items-center justify-center"
              >
                <NoImageIcon
                  className={`
        h-1/2
        fill-current
        transition ease-in
        opacity-50
        dark:text-white text-black

        `}
                  viewBox="0 0 32 32"
                />
              </div>
            )}
            {choice?.img && !imageFail && (
              <img
                src={choice.img}
                alt={choice.description || ''}
                onError={() => setImageFail(true)}
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
