import { PROMPT } from '@johnlindquist/kit/core/enum';
import type { Script } from '@johnlindquist/kit/types/core';
import log from 'electron-log';
import parse from 'html-react-parser';
import { useAtom, useAtomValue } from 'jotai';
import React, { useCallback, useEffect, useState, type DragEvent, useMemo, useRef } from 'react';
const { ipcRenderer } = window.electron;

import type { ChoiceButtonProps } from '../../../shared/types';
import {
  _modifiers,
  buttonDescriptionFontSizeAtom,
  buttonNameFontSizeAtom,
  flaggedChoiceValueAtom,
  indexAtom,
  inputAtom,
  isMouseDownAtom,
  isScrollingAtom,
  mouseEnabledAtom,
  promptDataAtom,
  selectedChoicesAtom,
  shouldHighlightDescriptionAtom,
  submitValueAtom,
  toggleSelectedChoiceAtom,
} from '../jotai';

// import { ReactComponent as NoImageIcon } from '../svg/ui/icons8-no-image.svg?asset';
import { AppChannel } from '../../../shared/enums';
import { IconSwapper } from './iconswapper';
import { highlight } from './utils';

function calculateScale(height: number = PROMPT.ITEM.HEIGHT.SM): string {
  if (height < PROMPT.ITEM.HEIGHT.SM) {
    return 'scale-75';
  }

  return 'scale-90';
}

function ChoiceButton({ index: buttonIndex, style, data: { choices } }: ChoiceButtonProps) {
  const scoredChoice = choices[buttonIndex];
  const choice = scoredChoice?.item;
  const [index, setIndex] = useAtom(indexAtom);
  const [mouseEnabled] = useAtom(mouseEnabledAtom);

  const [isMouseDown] = useAtom(isMouseDownAtom);
  const [flaggedValue, setFlagValue] = useAtom(flaggedChoiceValueAtom);
  const [modifiers] = useAtom(_modifiers);
  const [modifierDescription, setModifierDescription] = useState('');
  const [buttonNameFontSize] = useAtom(buttonNameFontSizeAtom);
  const [buttonDescriptionFontSize] = useAtom(buttonDescriptionFontSizeAtom);
  const input = useAtomValue(inputAtom);
  const [, setSubmitValue] = useAtom(submitValueAtom);
  const [promptData] = useAtom(promptDataAtom);
  const [, toggleSelectedChoice] = useAtom(toggleSelectedChoiceAtom);
  const [selectedChoices] = useAtom(selectedChoicesAtom);
  const [shouldHighlightDescription] = useAtom(shouldHighlightDescriptionAtom);

  // Get the text after the last file separator
  const base = (input || '').split(/[\\/]/).pop() || '';

  // const dataTransfer = useRef<any>('Data Transfer');

  const onRightClick = useCallback(
    (event) => {
      log.info(`Right clicked choice: ${choice?.id}`);
      event.preventDefault();
      event.stopPropagation();
      if (flaggedValue) {
        setFlagValue('');
      } else {
        setFlagValue(choice?.value ? choice?.value : choice);
      }
    },
    [choice, setFlagValue, flaggedValue],
  );

  const onClick = useCallback(
    (e) => {
      log.info(`Clicked choice: ${choice?.id}`);
      e.preventDefault();
      if (choice?.info || choice?.skip) {
        return;
      }
      if (promptData?.multiple) {
        toggleSelectedChoice(choice?.id);
      } else {
        setSubmitValue(choice?.value);
      }
    },
    [choice, promptData, toggleSelectedChoice, setSubmitValue],
  );

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
          event.dataTransfer?.setData(drag?.format || 'text/plain', drag?.data || 'please set drag.data');
        }
      }
    },
    [choice],
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

  const memoizedChoiceName = useMemo(() => {
    return choice?.name?.replace(/{\s*input\s*}/g, input).replace(/{\s*base\s*}/g, base) || '';
  }, [choice, input, base]);

  const memoizedHtmlDomNode = useMemo(() => {
    if (!choice?.html) {
      return '';
    }
    return parse(choice?.html, {
      replace: (domNode: any) => {
        if (domNode?.attribs && index === buttonIndex) {
          domNode.attribs.class += ' focused';
        }
        return domNode;
      },
    });
  }, [choice, index, buttonIndex]);

  useEffect(() => {
    const modifier = modifiers.find((m) => {
      return Object.keys(choice).includes(m);
    }) as keyof Script;

    const description = (choice as Script)?.[modifier];
    setModifierDescription(typeof description === 'string' ? description : '');
  }, [modifiers]);

  const [isScrolling] = useAtom(isScrollingAtom);

  const isRecent = choice?.group === 'Recent';

  const scale = useMemo(() => calculateScale(choice.height || promptData?.itemHeight), [choice.height, promptData?.itemHeight]);

  const buttonRef = useRef<HTMLButtonElement>(null);

  return (
    // biome-ignore lint/a11y/useKeyWithMouseEvents: <explanation>
    <button
      ref={buttonRef}
      tabIndex={-1}
      type="button"
      draggable={!!choice?.drag}
      onDragStart={choice?.drag ? onDragStart : undefined}
      onContextMenu={onRightClick}
      style={{
        cursor: mouseEnabled ? (choice?.drag ? (isMouseDown ? 'grabbing' : 'grab') : 'pointer') : 'none',
        ...style,
      }}
      className={`
      choice
      text-text-base
      ${index === buttonIndex && !choice?.disableSubmit ? choice?.focusedClassName || 'bg-ui-bg' : ''}
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
        ${index === buttonIndex ? 'opacity-100' : `opacity-90 ${flaggedValue ? 'opacity-30' : ''}`}
      `}
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      onMouseOver={onMouseEnter}
    >
      {choice?.html ? (
        memoizedHtmlDomNode
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
                  {selectedChoices.find((c) => choice?.id === c?.id) && <IconSwapper text="selected" />}
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
                ${index === buttonIndex ? 'opacity-100' : 'opacity-80'}
                `}
              />
            )}
            <div className="flex max-h-full max-w-full flex-col overflow-x-hidden">
              {/* Name */}
              <div className={`${buttonNameFontSize} truncate ${choice?.nameClassName}`}>
                {highlight(
                  memoizedChoiceName,
                  scoredChoice?.matches?.slicedName,
                  'bg-primary bg-opacity-5 text-primary',
                )}
                {choice?.nameHTML && parse(choice?.nameHTML)}
              </div>
              {/* Description */}
              {(choice?.focused || choice?.description || modifierDescription) && (
                <div
                  className={`truncate ${buttonDescriptionFontSize} ${choice?.descriptionClassName}${
                    index === buttonIndex ? ' text-primary opacity-100 ' : ' opacity-60 '
                  }`}
                >
                  {modifierDescription || (index === buttonIndex && choice?.focused)
                    ? choice?.focused
                    : shouldHighlightDescription
                      ? highlight(
                          choice.description || '',
                          scoredChoice?.matches?.description,
                          'bg-primary bg-opacity-5 text-primary',
                        )
                      : choice?.description}
                </div>
              )}
            </div>
          </div>

          <div className={`flex h-full flex-shrink-0 flex-row items-center ${isScrolling ? '-mr-2px' : '0'}`}>
            {(choice?.tag || choice?.icon || choice?.pass || isRecent) && (
              <div className="flex flex-row items-center">
                {((choice?.pass || isRecent) && (choice as Script)?.kenv
                  ? (choice as Script).kenv
                  : choice.tag || choice.keyword || choice.trigger) && (
                  <div
                    className={`mx-1 font-mono text-xxs ${choice?.tagClassName} ${
                      index === buttonIndex ? 'opacity-70' : 'opacity-40'
                    }`}
                  >
                    {(choice?.pass || isRecent) && (choice as Script)?.kenv && (choice as Script).kenv !== '.kit'
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
              </div>
            )}
          </div>
        </div>
      )}
    </button>
  );
}

export default React.memo(ChoiceButton);
