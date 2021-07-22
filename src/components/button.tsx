/* eslint-disable jsx-a11y/mouse-events-have-key-events */
/* eslint-disable react/no-array-index-key */
/* eslint-disable no-nested-ternary */
import React, { useState } from 'react';
import parse from 'html-react-parser';
import { ChoiceButtonProps } from '../types';

export default function ChoiceButton({
  data,
  index,
  style,
}: ChoiceButtonProps) {
  const { choices, currentIndex, mouseEnabled, onIndexChange, onIndexSubmit } =
    data;
  const choice = choices[index];

  const [mouseDown, setMouseDown] = useState(false);

  return (
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events
    <button
      type="button"
      onMouseDown={() => setMouseDown(true)}
      onMouseUp={() => setMouseDown(false)}
      style={style}
      className={`
  w-full
  h-16
  flex-shrink-0
  whitespace-nowrap
  text-left
  flex
  flex-row
  text-lg
  px-4
  justify-between
  items-center
  focus:outline-none
  ${
    index === currentIndex
      ? `dark:bg-white dark:bg-opacity-5 bg-white bg-opacity-50
      ${mouseDown ? `shadow-sm bg-opacity-25` : `shadow-lg hover:shadow-xl`}
      `
      : ``
  }



  transition-shadow ease-in-out duration-250
`}
      onClick={(_event) => {
        onIndexSubmit(index);
      }}
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
          {(choice?.tag || choice?.icon) &&
            (choice?.icon ? (
              <img
                alt="icon"
                className={`
              border-2 border-black dark:border-white border-opacity-50
              rounded-full

              w-6 h-6
              `}
                src={choice?.icon}
              />
            ) : (
              <div
                className={`
            text-xxs font-mono
            ${index === currentIndex ? `opacity-40` : `opacity-20`}
            `}
              >
                {choice.tag}
              </div>
            ))}

          {choice?.img && (
            <img
              src={choice.img}
              alt={choice.description || ''}
              className="py-2 h-full"
            />
          )}
        </div>
      )}
    </button>
  );
}
