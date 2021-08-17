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
import { ChoiceButtonProps } from '../types';
import { flagsAtom, flagValueAtom, inputAtom, scoredChoices } from '../jotai';
import { ReactComponent as MoreThanIcon } from '../svg/icons8-more-than.svg';
import { ReactComponent as NoImageIcon } from '../svg/icons8-no-image.svg';

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
  return (choice as Script)?.filePath !== undefined;
}

export default function ChoiceButton({
  data,
  index,
  style,
}: ChoiceButtonProps) {
  const { choices, currentIndex, mouseEnabled, onIndexChange, onIndexSubmit } =
    data;
  const scoredChoice = choices[index];
  const choice: Choice | Script = scoredChoice.item;

  const [mouseDown, setMouseDown] = useState(false);
  const [flags] = useAtom(flagsAtom);
  const [flaggedValue, setFlagValue] = useAtom(flagValueAtom);
  const [inputValue] = useAtom(inputAtom);

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

  const [imageFail, setImageFail] = useState(false);

  useEffect(() => {
    setImageFail(false);
  }, [choice]);

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
            {isScript(choice) &&
              (choice?.friendlyShortcut ||
                choice?.kenv ||
                choice?.tag ||
                choice?.icon) && (
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
              )}
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
