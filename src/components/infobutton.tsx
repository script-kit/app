/* eslint-disable react/jsx-props-no-spreading */
/* eslint-disable no-restricted-syntax */
/* eslint-disable jsx-a11y/no-static-element-interactions */
/* eslint-disable jsx-a11y/click-events-have-key-events */
/* eslint-disable jsx-a11y/mouse-events-have-key-events */
/* eslint-disable react/no-array-index-key */
/* eslint-disable no-nested-ternary */
import React, { useEffect, useState } from 'react';
import parse from 'html-react-parser';

import { overrideTailwindClasses } from 'tailwind-override';
import { Choice, Script } from '@johnlindquist/kit/types/core';
import { useAtom, useAtomValue } from 'jotai';
import { motion } from 'framer-motion';

import { ChoiceButtonProps } from '../types';
import {
  isMouseDownAtom,
  _modifiers,
  buttonNameFontSizeAtom,
  inputAtom,
  buttonDescriptionFontSizeAtom,
} from '../jotai';

import { ReactComponent as NoImageIcon } from '../svg/ui/icons8-no-image.svg';

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

function isNotScript(choice: Choice | Script): choice is Script {
  return (choice as Script)?.command === undefined;
}

export default function InfoButton({ data, index, style }: ChoiceButtonProps) {
  const { choices, currentIndex, mouseEnabled, onIndexChange } = data;
  const scoredChoice = choices[index];
  const choice: Choice | Script = scoredChoice?.item || scoredChoice;

  const [isMouseDown] = useAtom(isMouseDownAtom);
  const [buttonNameFontSize] = useAtom(buttonNameFontSizeAtom);
  const [buttonDescriptionFontSize] = useAtom(buttonDescriptionFontSizeAtom);

  const [modifierDescription, setModifierDescription] = useState('');

  const [imageFail, setImageFail] = useState(false);

  const input = useAtomValue(inputAtom);

  useEffect(() => {
    setImageFail(false);
  }, [choice]);

  return (
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events
    <button
      type="button"
      style={{
        ...style,
      }}
      className={`
      text-primary/90
      bg-bg-base/15
       ${overrideTailwindClasses(`
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
        outline-none
        focus:outline-none
        ${choice?.className}
      `)}`}
    >
      {choice?.html ? (
        parse(choice?.html, {
          replace: (domNode: any) => {
            if (domNode?.attribs && index === currentIndex)
              domNode.attribs.class += ' focused';
            return domNode;
          },
        })
      ) : (
        <div className="flex flex-row items-center justify-between w-full h-full">
          <div className="flex flex-row overflow-x-hidden items-center h-full">
            {/* Img */}
            {choice?.img && !imageFail && (
              <motion.img
                initial={{ opacity: 0, width: 0 }}
                animate={{ opacity: 1, width: 'auto' }}
                transition={{ duration: 0.1 }}
                src={choice.img}
                alt={choice.description || ''}
                onError={() => setImageFail(true)}
                className={`
                h-12

                rounded
                mr-2
                ${index === currentIndex ? `opacity-100` : `opacity-80`}
                `}
              />
            )}
            <div className="flex flex-col max-w-full overflow-x-hidden">
              {/* Name */}
              <div
                className={
                  choice?.nameClassName
                    ? choice?.nameClassName
                    : `${buttonNameFontSize} truncate`
                }
              >
                {highlight(
                  choice.name?.replace(/{\s*input\s*}/g, input),
                  scoredChoice?.matches?.slicedName,
                  'bg-primary bg-opacity-5 text-text-base'
                )}
              </div>
              {/* Description */}
              {(choice?.focused ||
                choice?.description ||
                modifierDescription) && (
                <div
                  className={`pb-1
                  ${
                    choice?.descriptionClassName
                      ? choice?.descriptionClassName
                      : `${buttonDescriptionFontSize} truncate text-text-base/80`
                  }`}
                >
                  {modifierDescription ||
                  (index === currentIndex && choice?.focused)
                    ? choice?.focused
                    : highlight(
                        choice?.description?.replace(/{\s*input\s*}/g, input) ||
                          '',
                        scoredChoice?.matches?.slicedDescription,
                        'bg-primary bg-opacity-15 text-text-base'
                      )}
                </div>
              )}
            </div>
          </div>

          <div className="flex flex-row items-center flex-shrink-0 h-full">
            {isNotScript(choice) && (choice?.tag || choice?.icon) && (
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
                  <motion.img
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.1 }}
                    alt="icon"
                    className={`
    border-2 border-bg-base border-opacity-50
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
              ${index === currentIndex ? `opacity-100` : `opacity-40`}
              `}
                  >
                    {highlight(
                      choice.friendlyShortcut,
                      scoredChoice?.matches?.friendlyShortcut,
                      'bg-text-base bg-opacity-0 text-primary text-opacity-100'
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
                      'bg-text-base bg-opacity-0 text-primary'
                    )}
                  </div>
                )}
              </div>
            )}
            {imageFail && (
              <div
                style={{ aspectRatio: '1/1' }}
                className="h-8 flex flex-row items-center justify-center"
              >
                <NoImageIcon
                  className={`
        h-1/2
        fill-current
        transition ease-in
        opacity-50
        text-text-base

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
