import type { Script } from '@johnlindquist/kit/types/core';
import parse from 'html-react-parser';
import { useAtom, useAtomValue } from 'jotai';
import React, { useCallback, useEffect, useState, type DragEvent } from 'react';
const { ipcRenderer } = window.electron;

import type { ChoiceButtonProps } from '../../../shared/types';
import {
  _modifiers,
  actionsButtonDescriptionFontSizeAtom,
  actionsButtonNameFontSizeAtom,
  flagsIndexAtom,
  focusedChoiceAtom,
  inputAtom,
  isMouseDownAtom,
  isScrollingAtom,
  mouseEnabledAtom,
  submitValueAtom,
  uiAtom,
} from '../jotai';

import { UI } from '@johnlindquist/kit/core/enum';
// import { ReactComponent as NoImageIcon } from '../svg/ui/icons8-no-image.svg';
import { AppChannel } from '../../../shared/enums';
import { highlight } from './utils';

function FlagButton({ index: buttonIndex, style, data: { choices } }: ChoiceButtonProps) {
  const scoredChoice = choices[buttonIndex];
  const choice = scoredChoice?.item;
  const [index, setIndex] = useAtom(flagsIndexAtom);

  const [mouseEnabled] = useAtom(mouseEnabledAtom);

  const [isMouseDown] = useAtom(isMouseDownAtom);
  const [modifiers] = useAtom(_modifiers);
  const [modifierDescription, setModifierDescription] = useState('');
  const [buttonNameFontSize] = useAtom(actionsButtonNameFontSizeAtom);
  const [buttonDescriptionFontSize] = useAtom(actionsButtonDescriptionFontSizeAtom);
  const input = useAtomValue(inputAtom);
  const [, setSubmitValue] = useAtom(submitValueAtom);
  const [focusedChoice] = useAtom(focusedChoiceAtom);

  // Get the text after the last file separator
  const base = (input || '').split(/[\\/]/).pop() || '';

  // const dataTransfer = useRef<any>('Data Transfer');

  const onClick = useCallback(
    (e) => {
      e.preventDefault();
      setSubmitValue(focusedChoice?.value);
    },
    [focusedChoice, setSubmitValue],
  );
  const onMouseOver = useCallback(() => {
    if (mouseEnabled) {
      setIndex(buttonIndex);
    }
  }, [buttonIndex, mouseEnabled, setIndex]);

  const [imageFail, setImageFail] = useState(false);
  const ui = useAtomValue(uiAtom);

  const focusedName = ui === UI.arg && focusedChoice?.name ? focusedChoice.name : '';

  useEffect(() => {
    setImageFail(false);
  }, [choice]);

  const onDragStart = useCallback(
    (event: DragEvent) => {
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
          event.dataTransfer?.setData(drag?.format || 'text/plain', drag?.data || 'please set drag.data');
        }
      }
    },
    [choice],
  );

  useEffect(() => {
    const modifier = modifiers.find((m) => {
      return Object.keys(choice).includes(m);
    }) as keyof Script;

    const description = (choice as Script)?.[modifier];
    setModifierDescription(typeof description === 'string' ? description : '');
  }, [modifiers]);

  const [isScrolling] = useAtom(isScrollingAtom);

  const isRecent = choice?.group === 'Recent';

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
      style={{
        cursor: mouseEnabled ? (choice?.drag ? (isMouseDown ? 'grabbing' : 'grab') : 'pointer') : 'none',
        ...style,
      }}
      className={`
      text-text-base
      ${index === buttonIndex && !choice?.disableSubmit ? 'bg-ui-bg' : ''}
        flex
        h-16
        w-full
        flex-shrink-0
        flex-row
        items-center
        justify-between
        whitespace-nowrap
        px-[18px]

        text-left
        outline-none
        focus:outline-none
        ${choice?.className}
        ${index === buttonIndex ? 'opacity-100' : 'opacity-90'}
      }`}
      onClick={onClick}
      onMouseOver={onMouseOver}
    >
      {/* <span className="text-primary/90 text-xxs">{JSON.stringify(choice)}</span> */}
      {choice?.html ? (
        parse(choice?.html, {
          replace: (domNode: any) => {
            if (domNode?.attribs && index === buttonIndex) {
              domNode.attribs.class += ' focused';
            }
            return domNode;
          },
        })
      ) : (
        <div className="flex h-full w-full flex-row items-center justify-between">
          <div className="flex h-full flex-row items-center overflow-x-hidden mt-0.5">
            {/* Img */}
            {choice?.img && !imageFail && (
              <img
                src={choice.img}
                alt={choice.description || ''}
                onError={() => setImageFail(true)}
                className={`
                mr-2
                h-4/5
                rounded
                object-contain
                ${index === buttonIndex ? 'opacity-100' : 'opacity-80'}
                `}
              />
            )}
            <div className="flex max-h-full max-w-full flex-col overflow-x-hidden">
              {/* Name */}
              <div className={`${buttonNameFontSize} truncate ${choice?.nameClassName}`}>
                {highlight(
                  choice.name?.replace(/{\s*input\s*}/g, input).replace(/{\s*base\s*}/g, base),
                  scoredChoice?.matches?.slicedName,
                  'bg-primary bg-opacity-5 text-primary',
                )}
              </div>
              {/* Description */}
              {(choice?.focused || choice?.description || modifierDescription) && (
                <div
                  className={`truncate pb-1 ${buttonDescriptionFontSize} ${choice?.descriptionClassName}${
                    index === buttonIndex ? ' text-primary opacity-100 ' : ' opacity-60 '
                  }`}
                >
                  {modifierDescription || (index === buttonIndex && choice?.focused)
                    ? choice?.focused
                    : focusedName
                      ? choice?.description?.replace('{{name}}', focusedName)
                      : choice?.description}
                </div>
              )}
            </div>
          </div>

          <div className={`flex h-full flex-shrink-0 flex-row items-center ${isScrolling ? '-mr-2px' : '0'}`}>
            {(choice?.tag || choice?.icon || choice?.pass || isRecent) && (
              <div className="flex flex-row items-center">
                {((choice?.pass || isRecent) && (choice as Script)?.kenv ? (choice as Script).kenv : choice.tag) && (
                  <div
                    className={`mx-1 truncate font-mono text-xxs ${choice?.tagClassName} ${
                      index === buttonIndex ? 'opacity-70' : 'opacity-40'
                    }`}
                  >
                    {(choice?.pass || isRecent) && (choice as Script)?.kenv && (choice as Script)?.kenv !== '.kit'
                      ? (choice as Script).kenv
                      : choice.tag
                        ? highlight(
                            choice.tag,
                            scoredChoice?.matches?.tag,
                            'bg-text-base bg-opacity-0 text-primary text-opacity-100',
                          )
                        : ''}
                  </div>
                )}

                {choice?.icon && (
                  <img
                    alt="icon"
                    className={`
    mx-1 h-6 rounded-full
    border-2
    border-bg-base border-opacity-50
    `}
                    src={choice?.icon}
                  />
                )}
              </div>
            )}

            {imageFail && (
              <div style={{ aspectRatio: '1/1' }} className="flex h-8 flex-row items-center justify-center">
                {/* <NoImageIcon
                  className={`
        h-1/2
        fill-current
        text-text-base opacity-50
        transition
        ease-in

        `}
                  viewBox="0 0 32 32"
                /> */}
              </div>
            )}
          </div>
        </div>
      )}
    </button>
  );
}

export default React.memo(FlagButton);
