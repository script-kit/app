/* eslint-disable react/require-default-props */
import React, { useEffect, useRef, useCallback } from 'react';
import { motion, useAnimation, useMotionValue } from 'framer-motion';
import { FixedSizeList as List } from 'react-window';
import { useAtom } from 'jotai';
import memoize from 'memoize-one';
import Preview from './preview';
import ChoiceButton from './button';
import {
  flagValueAtom,
  indexAtom,
  inputAtom,
  mainHeightAtom,
  mouseEnabledAtom,
  scoredChoices,
  submitValueAtom,
  previewEnabledAtom,
  hasPreviewAtom,
} from '../jotai';
import { ChoiceButtonProps, ListProps } from '../types';
import { BUTTON_HEIGHT, DEFAULT_LIST_WIDTH, DEFAULT_WIDTH } from '../defaults';

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
  const [index, onIndexChange] = useAtom(indexAtom);
  const [inputValue] = useAtom(inputAtom);
  const [mainHeight, setMainHeight] = useAtom(mainHeightAtom);
  const [flagValue] = useAtom(flagValueAtom);
  const [previewEnabled] = useAtom(previewEnabledAtom);
  const [hasPreview] = useAtom(hasPreviewAtom);
  const listWidth = useMotionValue('100%');

  const onIndexSubmit = useCallback(
    (i) => {
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

  // useResizeObserver(innerRef, (entry) => {
  //   if (entry?.contentRect?.height) {
  //     setMainHeight(entry.contentRect.height);
  //   }
  // });

  useEffect(() => {
    const newListHeight = choices.length * BUTTON_HEIGHT;
    setMainHeight(newListHeight);
  }, [choices, setMainHeight]);

  useEffect(() => {
    if (choices.length && height) {
      (listRef as any).current.scrollToItem(index);
    }
  }, [index, choices, height, flagValue]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{
        opacity: choices?.length ? 1 : 0,
      }}
      transition={{ duration: 0.15, ease: 'circOut' }}
      id="list"
      className={`

      list-component
      flex flex-row
      w-full
      overflow-y-hidden border-t dark:border-white dark:border-opacity-5 border-black border-opacity-5
      `}
      style={
        {
          width,
          height,
          WebkitAppRegion: 'no-drag',
          WebkitUserSelect: 'none',
        } as any
      }
    >
      <List
        style={{
          minWidth:
            previewEnabled && hasPreview ? DEFAULT_LIST_WIDTH : DEFAULT_WIDTH,
        }}
        ref={listRef}
        innerRef={innerRef}
        height={height}
        itemCount={choices?.length || 0}
        itemSize={BUTTON_HEIGHT}
        width="100%"
        itemData={itemData}
        className={`
        h-full
        px-0 flex flex-col
        text-black dark:text-white
        overflow-y-scroll focus:border-none focus:outline-none outline-none flex-1 bg-opacity-20
        `}
        // onItemsRendered={onItemsRendered}
      >
        {ChoiceButton}
      </List>

      {previewEnabled && <Preview />}
    </motion.div>
  );
}
