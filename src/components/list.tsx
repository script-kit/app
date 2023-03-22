/* eslint-disable react/require-default-props */
import React, { useEffect, useRef, useCallback, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { FixedSizeList as List } from 'react-window';
import { useAtom, useAtomValue } from 'jotai';
import memoize from 'memoize-one';
import Preview from './preview';
import ChoiceButton from './button';
import {
  flagValueAtom,
  _index,
  mouseEnabledAtom,
  scoredChoices,
  submitValueAtom,
  previewEnabledAtom,
  hasPreviewAtom,
  previewHTMLAtom,
  itemHeightAtom,
  appDbAtom,
  infoHeightAtom,
  promptDataAtom,
  indexHookAtom,
  listAtom,
} from '../jotai';
import { ChoiceButtonProps, ListProps } from '../types';
import { DEFAULT_LIST_WIDTH, DEFAULT_WIDTH } from '../defaults';

const createItemData = memoize(
  (choices, currentIndex, mouseEnabled, onIndexChange, onIndexSubmit) =>
    ({
      choices,
      currentIndex,
      mouseEnabled,
      onIndexChange,
      onIndexSubmit,
    } as ChoiceButtonProps['data'])
);

export default function ChoiceList({ width, height }: ListProps) {
  const listRef = useRef(null);
  const innerRef = useRef(null);
  const [mouseEnabled] = useAtom(mouseEnabledAtom);
  // TODO: In case items ever have dynamic height
  const [choices] = useAtom(scoredChoices);
  const [submitValue, setSubmitValue] = useAtom(submitValueAtom);
  const [index, onIndexChange] = useAtom(_index);
  // const [inputValue] = useAtom(inputAtom);
  // const [mainHeight, setMainHeight] = useAtom(mainHeightAtom);
  const [flagValue] = useAtom(flagValueAtom);
  const [previewEnabled] = useAtom(previewEnabledAtom);
  const [hasPreview] = useAtom(hasPreviewAtom);
  const [previewHTML] = useAtom(previewHTMLAtom);
  const [appDb] = useAtom(appDbAtom);
  const itemHeight = useAtomValue(itemHeightAtom);
  const infoHeight = useAtomValue(infoHeightAtom);
  const promptData = useAtomValue(promptDataAtom);
  const [list, setList] = useAtom(listAtom);
  // const listWidth = useMotionValue('100%');

  const onIndexSubmit = useCallback(
    (i: number) => {
      if (choices.length) {
        const choice = choices[i];

        setSubmitValue(choice?.item?.value);
      }
    },
    [choices, setSubmitValue]
  );

  const itemData = createItemData(
    choices,
    index,
    mouseEnabled,
    onIndexChange,
    onIndexSubmit
  );

  useEffect(() => {
    if (listRef.current) {
      setList(listRef.current);
    }
  }, [setList]);

  // useEffect(() => {
  //   if (choices.length && height) {
  //     (listRef as any).current.scrollToItem(index);
  //   }
  // }, [index, choices, height, flagValue]);

  return (
    <div
      id="list"
      className={`

      list-component
      flex flex-row
      w-full
      overflow-y-hidden border-t border-secondary border-opacity-75
      `}
      style={
        {
          width,
        } as any
      }
    >
      <List
        style={{
          // minHeight: Math.min(choices?.length * itemHeight, height),
          minWidth:
            previewEnabled && hasPreview ? DEFAULT_LIST_WIDTH : DEFAULT_WIDTH,
        }}
        ref={listRef}
        innerRef={innerRef}
        height={
          promptData?.resize
            ? Math.min(height, choices.length * itemHeight + infoHeight)
            : height
        }
        itemCount={choices?.length || 0}
        itemSize={itemHeight}
        width="100%"
        itemData={itemData}
        className={`
        wrapper
        px-0 flex flex-col
        text-text-base
        overflow-y-scroll focus:border-none focus:outline-none outline-none flex-1 bg-opacity-20

        ${
          !appDb.mini && previewEnabled && hasPreview
            ? 'border-r  border-secondary border-opacity-75'
            : ''
        }
        `}
        // onItemsRendered={onItemsRendered}
      >
        {ChoiceButton}
      </List>

      {/* {previewEnabled && <Preview />} */}
      <AnimatePresence key="previewComponents">
        {!appDb.mini && previewHTML && (
          <Preview key="AppPreview" height={height} />
        )}
      </AnimatePresence>
    </div>
  );
}
