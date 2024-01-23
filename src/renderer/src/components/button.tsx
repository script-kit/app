/* eslint-disable react/jsx-props-no-spreading */
/* eslint-disable no-restricted-syntax */
/* eslint-disable jsx-a11y/no-static-element-interactions */
/* eslint-disable jsx-a11y/click-events-have-key-events */
/* eslint-disable jsx-a11y/mouse-events-have-key-events */
/* eslint-disable react/no-array-index-key */
/* eslint-disable no-nested-ternary */
import React, { useCallback, useEffect, useState, DragEvent } from 'react';
import parse from 'html-react-parser';
import { ScriptMetadata } from '@johnlindquist/kit/types/core';
import { PROMPT } from '@johnlindquist/kit/core/enum';
import { useAtom, useAtomValue } from 'jotai';
const { ipcRenderer } = window.electron;

import { ChoiceButtonProps } from '../../../shared/types';
import {
  flagsAtom,
  flaggedChoiceValueAtom,
  isMouseDownAtom,
  _modifiers,
  buttonNameFontSizeAtom,
  buttonDescriptionFontSizeAtom,
  isScrollingAtom,
  inputAtom,
  mouseEnabledAtom,
  indexAtom,
  submitValueAtom,
  hasRightShortcutAtom,
  promptDataAtom,
  toggleSelectedChoiceAtom,
  selectedChoicesAtom,
  shouldHighlightDescriptionAtom,
} from '../jotai';

// import { ReactComponent as NoImageIcon } from '../svg/ui/icons8-no-image.svg?asset';
import { AppChannel } from '../../../shared/enums';
import { IconSwapper } from './iconswapper';

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

function calculateScale(height: number): string {
  if (height === PROMPT.ITEM.HEIGHT.XS) {
    return 'scale-75';
  }
  if (height === PROMPT.ITEM.HEIGHT.SM) {
    return 'scale-90';
  }
  return '';
}

function ChoiceButton({
  index: buttonIndex,
  style,
  data: { choices },
}: ChoiceButtonProps) {
  const scoredChoice = choices[buttonIndex];
  const choice = scoredChoice?.item;
  const [index, setIndex] = useAtom(indexAtom);
  const [mouseEnabled] = useAtom(mouseEnabledAtom);

  const [isMouseDown] = useAtom(isMouseDownAtom);
  const [flags] = useAtom(flagsAtom);
  const [flaggedValue, setFlagValue] = useAtom(flaggedChoiceValueAtom);
  const [modifiers] = useAtom(_modifiers);
  const [modifierDescription, setModifierDescription] = useState('');
  const [buttonNameFontSize] = useAtom(buttonNameFontSizeAtom);
  const [buttonDescriptionFontSize] = useAtom(buttonDescriptionFontSizeAtom);
  const input = useAtomValue(inputAtom);
  const [submitValue, setSubmitValue] = useAtom(submitValueAtom);
  const hasRightShortcut = useAtomValue(hasRightShortcutAtom);
  const [promptData] = useAtom(promptDataAtom);
  const [, toggleSelectedChoice] = useAtom(toggleSelectedChoiceAtom);
  const [selectedChoices] = useAtom(selectedChoicesAtom);
  const [shouldHighlightDescription] = useAtom(shouldHighlightDescriptionAtom);

  // Get the text after the last file separator
  const base = (input || '').split(/[\\/]/).pop() || '';

  // const dataTransfer = useRef<any>('Data Transfer');

  const onRightClick = useCallback(
    (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (flaggedValue) {
        setFlagValue('');
      } else {
        setFlagValue(choice?.value);
      }
    },
    [choice, setFlagValue, flaggedValue]
  );

  const onClick = useCallback(
    (e) => {
      e.preventDefault();
      if (promptData?.multiple) {
        toggleSelectedChoice(choice?.id);
      } else {
        setSubmitValue(choice?.value);
      }
    },
    [promptData, toggleSelectedChoice, choice.id, choice.value, setSubmitValue]
  );
  const onMouseEnter = useCallback(() => {
    if (mouseEnabled) {
      setIndex(buttonIndex);
    }
  }, [buttonIndex, mouseEnabled, setIndex]);

  const [imageFail, setImageFail] = useState(false);

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
          event.dataTransfer?.setData(
            drag?.format || 'text/plain',
            drag?.data || `please set drag.data`
          );
        }
      }
    },
    [choice]
  );

  useEffect(() => {
    const modifier = modifiers.find((m) => {
      return Object.keys(choice).includes(m);
    }) as keyof ScriptMetadata;

    setModifierDescription((choice as unknown as ScriptMetadata)?.[modifier]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modifiers]);

  const [isScrolling] = useAtom(isScrollingAtom);

  const isRecent = choice?.group === 'Recent';

  const scale = calculateScale(choice.height || promptData?.itemHeight);

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
      text-text-base
      ${
        index === buttonIndex && !choice?.disableSubmit
          ? choice?.focusedClassName || `bg-ui-bg`
          : ``
      }
        flex
        h-16
        w-full
        flex-shrink-0
        flex-row
        items-center
        justify-between
        whitespace-nowrap
        px-4
        text-left
        outline-none
        focus:outline-none
        ${choice?.className}
        ${
          index === buttonIndex
            ? `opacity-100`
            : `opacity-90 ${flaggedValue ? 'opacity-30' : ''}`
        }
      `}
      onClick={onClick}
      onMouseEnter={onMouseEnter}
    >
      {choice?.html ? (
        parse(choice?.html, {
          replace: (domNode: any) => {
            if (domNode?.attribs && index === buttonIndex)
              domNode.attribs.class += ' focused';
            return domNode;
          },
        })
      ) : (
        <div className="flex h-full w-full flex-row items-center justify-between">
          <div className="flex h-full flex-row items-center overflow-x-hidden">
            {/* Checkbox */}
            {promptData?.multiple && (
              <div>
                <div
                  className={`
                leading-1 -pl-1 mr-2 flex
                    h-6
                    w-6
                    ${scale}
                    items-center

                    justify-center
                    rounded
                    bg-text-base
                    bg-opacity-10
                    fill-current

 text-xs
        font-bold text-primary/90
        transition
        ease-in
        hover:bg-opacity-20 hover:text-primary/90


        `}
                >
                  {selectedChoices.find((c) => choice?.id === c?.id) && (
                    <IconSwapper text="selected" />
                  )}
                </div>
              </div>
            )}
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
                ${index === buttonIndex ? `opacity-100` : `opacity-80`}
                `}
              />
            )}
            <div className="flex max-h-full max-w-full flex-col overflow-x-hidden">
              {/* Name */}
              <div
                className={`${buttonNameFontSize} truncate ${choice?.nameClassName}`}
              >
                {highlight(
                  choice.name
                    ?.replace(/{\s*input\s*}/g, input)
                    .replace(/{\s*base\s*}/g, base),
                  scoredChoice?.matches?.slicedName,
                  `bg-primary bg-opacity-5 text-primary`
                )}
                {choice?.nameHTML && parse(choice?.nameHTML)}
              </div>
              {/* Description */}
              {(choice?.focused ||
                choice?.description ||
                modifierDescription) && (
                <div
                  className={`truncate pb-1 ${buttonDescriptionFontSize} ${choice?.descriptionClassName}${
                    index === buttonIndex
                      ? ` text-primary opacity-100 `
                      : ` opacity-60 `
                  }`}
                >
                  {modifierDescription ||
                  (index === buttonIndex && choice?.focused)
                    ? choice?.focused
                    : shouldHighlightDescription
                      ? highlight(
                          choice.description || '',
                          scoredChoice?.matches?.description,
                          `bg-primary bg-opacity-5 text-primary`
                        )
                      : choice?.description}
                </div>
              )}
            </div>
          </div>

          <div
            className={`flex h-full flex-shrink-0 flex-row items-center ${
              isScrolling ? `-mr-2px` : `0`
            }`}
          >
            {(choice?.tag || choice?.icon || choice?.pass || isRecent) && (
              <div className="flex flex-row items-center">
                {((choice?.pass || isRecent) && choice?.kenv
                  ? choice.kenv
                  : choice.tag || choice.keyword || choice.trigger) && (
                  <div
                    className={`mx-1 font-mono text-xxs ${choice?.tagClassName} ${
                      index === buttonIndex ? `opacity-70` : `opacity-40`
                    }`}
                  >
                    {(choice?.pass || isRecent) &&
                    choice?.kenv &&
                    choice?.kenv !== '.kit'
                      ? choice.kenv
                      : choice.tag
                        ? highlight(
                            choice.tag,
                            scoredChoice?.matches?.tag,
                            'bg-text-base bg-opacity-0 text-primary text-opacity-100'
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
              <div
                style={{ aspectRatio: '1/1' }}
                className="flex h-8 flex-row items-center justify-center"
              >
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

            {index === buttonIndex &&
              !hasRightShortcut &&
              !choice?.ignoreFlags &&
              (Boolean(choice?.actions) ||
                Boolean(Object.keys(flags).length)) && (
                <div onClick={onRightClick}>
                  <div
                    className={`
                leading-1 ml-2 flex
                    h-6
                    w-6
                    ${scale}

                    items-center

                    justify-center
                    rounded
                    bg-text-base
                    bg-opacity-10
                    fill-current

 text-xs
        font-bold text-primary/90
        transition
        ease-in
        hover:bg-opacity-20 hover:text-primary/90
        `}
                  >
                    <IconSwapper text="→" />
                  </div>
                </div>
              )}
          </div>
        </div>
      )}
    </button>
  );
}

export default React.memo(ChoiceButton);
