/* eslint-disable react/require-default-props */
import React, { useEffect, useRef, useCallback } from 'react';
import { VariableSizeList as List } from 'react-window';
import { useAtom, useAtomValue } from 'jotai';
import memoize from 'memoize-one';
import ChoiceButton from './button';
import {
  _index,
  mouseEnabledAtom,
  scoredChoicesAtom,
  submitValueAtom,
  itemHeightAtom,
  infoHeightAtom,
  promptDataAtom,
  listAtom,
  requiresScrollAtom,
  logAtom,
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
  const [mouseEnabled] = useAtom(mouseEnabledAtom);
  // TODO: In case items ever have dynamic height
  const [choices] = useAtom(scoredChoicesAtom);
  const [submitValue, setSubmitValue] = useAtom(submitValueAtom);
  const [index, onIndexChange] = useAtom(_index);
  // const [inputValue] = useAtom(inputAtom);
  // const [mainHeight, setMainHeight] = useAtom(mainHeightAtom);
  const itemHeight = useAtomValue(itemHeightAtom);
  const infoHeight = useAtomValue(infoHeightAtom);
  const promptData = useAtomValue(promptDataAtom);
  const [list, setList] = useAtom(listAtom);
  const [requiresScroll, setRequiresScroll] = useAtom(requiresScrollAtom);
  const log = useAtomValue(logAtom);

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

  useEffect(() => {
    if (!listRef.current) return;

    const scroll = () => {
      if (requiresScroll === -1) return;
      onIndexChange(requiresScroll);
      (listRef as any).current.scrollToItem(
        requiresScroll,
        requiresScroll > 0 ? 'center' : 'start'
      );
    };

    scroll();
    setTimeout(() => {
      if (listRef.current) {
        scroll();
        setRequiresScroll(-1);
      }
    }, 100);
  }, [requiresScroll, choices]);

  useEffect(() => {
    if (!listRef.current) return;
    listRef?.current?.resetAfterIndex(0);
  }, [choices]);

  const choicesHeight = choices.reduce((acc, choice) => {
    return acc + (choice?.item?.height || itemHeight);
  }, 0);

  return (
    <div
      id="list"
      className={`list-component
flex flex-row
w-full overflow-y-hidden
border-r border-ui-border
      `}
      style={
        {
          width,
        } as any
      }
    >
      <List
        ref={listRef}
        innerRef={innerRef}
        height={
          promptData?.resize
            ? // TODO: add itemHeight to choices in Kit SDK
              Math.min(height, choicesHeight + infoHeight)
            : height
        }
        itemCount={choices?.length || 0}
        itemSize={(i) => {
          return choices?.[i]?.item?.height || itemHeight;
        }}
        itemKey={(i, data) => {
          const id = data?.choices?.[i]?.item?.id;
          return id || i;
        }}
        width="100%"
        itemData={itemData}
        className={`
        wrapper
        px-0 flex flex-col
        text-text-base
        overflow-y-scroll focus:border-none focus:outline-none outline-none flex-1 bg-opacity-20
        `}
        // onItemsRendered={onItemsRendered}
      >
        {ChoiceButton}
      </List>
    </div>
  );
}
