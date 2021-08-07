/* eslint-disable react/require-default-props */
import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  useLayoutEffect,
} from 'react';

import { FixedSizeList as List } from 'react-window';
import { useAtom } from 'jotai';
import memoize from 'memoize-one';
import Preview from './preview';
import ChoiceButton from './button';
import {
  choicesAtom,
  flagValueAtom,
  indexAtom,
  inputAtom,
  mainHeightAtom,
  mouseEnabledAtom,
  submitValueAtom,
} from '../jotai';
import { ChoiceButtonProps, ListProps } from '../types';

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
  const [mouseEnabled, setMouseEnabled] = useAtom(mouseEnabledAtom);
  // TODO: In case items ever have dynamic height
  const [listItemHeight, setListItemHeight] = useState(64);
  const [choices] = useAtom(choicesAtom);
  const [submitValue, setSubmitValue] = useAtom(submitValueAtom);
  const [index, onIndexChange] = useAtom(indexAtom);
  const [inputValue] = useAtom(inputAtom);
  const [mainHeight, setMainHeight] = useAtom(mainHeightAtom);
  const [flagValue] = useAtom(flagValueAtom);

  const onIndexSubmit = useCallback(
    (i) => {
      if (choices.length) {
        const choice = choices[i];

        setSubmitValue(choice.value);
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

  useLayoutEffect(() => {
    const newListHeight = choices.length * listItemHeight;
    setMainHeight(newListHeight);
  }, [choices, listItemHeight, setMainHeight]);

  useEffect(() => {
    if (choices.length && height) {
      (listRef as any).current.scrollToItem(index);
    }
  }, [index, choices, height, flagValue]);

  return (
    <div
      className={`
      list-component
      flex flex-row
      w-full min-w-1/2
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
        ref={listRef}
        innerRef={innerRef}
        height={height}
        itemCount={choices?.length || 0}
        itemSize={listItemHeight}
        width="100%"
        itemData={itemData}
        className={`
        h-full
        px-0 flex flex-col
        text-black dark:text-white
        overflow-y-scroll focus:border-none focus:outline-none outline-none flex-1 bg-opacity-20 min-w-1/2`}
        // onItemsRendered={onItemsRendered}
      >
        {ChoiceButton}
      </List>
      {choices?.[index]?.preview && (
        <Preview preview={choices?.[index]?.preview || ''} />
      )}
    </div>
  );
}
