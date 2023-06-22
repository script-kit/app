/* eslint-disable react/require-default-props */
import React, { useEffect, useRef, useCallback, useState } from 'react';
import { VariableSizeList as List } from 'react-window';
import { useAtom, useAtomValue } from 'jotai';
import memoize from 'memoize-one';
import ChoiceButton from './button';
import {
  indexAtom,
  mouseEnabledAtom,
  scoredChoicesAtom,
  submitValueAtom,
  itemHeightAtom,
  infoHeightAtom,
  promptDataAtom,
  listAtom,
  requiresScrollAtom,
  hasGroupAtom,
  isScrollingAtom,
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
  const [index, onIndexChange] = useAtom(indexAtom);
  // const [inputValue] = useAtom(inputAtom);
  // const [mainHeight, setMainHeight] = useAtom(mainHeightAtom);
  const itemHeight = useAtomValue(itemHeightAtom);
  const infoHeight = useAtomValue(infoHeightAtom);
  const promptData = useAtomValue(promptDataAtom);
  const hasGroup = useAtomValue(hasGroupAtom);
  const [list, setList] = useAtom(listAtom);
  const [requiresScroll, setRequiresScroll] = useAtom(requiresScrollAtom);
  const [isScrolling, setIsScrolling] = useAtom(isScrollingAtom);

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
        // eslint-disable-next-line no-nested-ternary
        requiresScroll > 0 ? (hasGroup ? 'auto' : 'center') : 'start'
      );
    };

    scroll();
    setTimeout(() => {
      if (listRef.current) {
        scroll();
        setRequiresScroll(-1);
      }
    }, 100);
  }, [requiresScroll, choices, hasGroup]);

  useEffect(() => {
    if (!listRef.current) return;
    const needsReset = choices.find((c) => c?.item?.height !== itemHeight);
    if (needsReset) {
      (listRef?.current as any)?.resetAfterIndex(0);
    }
  }, [choices, itemHeight]);

  const [scrollTimeout, setScrollTimeout] = useState<any>(null);

  const choicesHeight = choices.reduce((acc, choice) => {
    return acc + (choice?.item?.height || itemHeight);
  }, 0);
  return (
    <div
      id="list"
      className="list-component flex w-full flex-row overflow-y-hidden"
      style={
        {
          width,
        } as any
      }
    >
      <List
        ref={listRef}
        innerRef={innerRef}
        overscanCount={12}
        onScroll={(props) => {
          if (index === 0 || index === 1) {
            setIsScrolling(false);
          } else {
            setIsScrolling(true);
          }

          // TODO: Disable scrolling if onScroll hasn't trigger for 250ms
          // clear the previous timeout
          if (scrollTimeout) clearTimeout(scrollTimeout);

          // set a new timeout
          setScrollTimeout(
            setTimeout(() => {
              setIsScrolling(false);
            }, 250)
          );
        }}
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
        ${isScrolling ? `scrollbar` : ''}
        wrapper
        bg-opacity-20
        px-0
        text-text-base outline-none focus:border-none focus:outline-none
        `}
        // onItemsRendered={onItemsRendered}
      >
        {ChoiceButton}
      </List>
    </div>
  );
}
