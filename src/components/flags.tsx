/* eslint-disable react/require-default-props */
import React, { useEffect, useRef, useState } from 'react';
import { VariableSizeList as List } from 'react-window';
import { useAtom, useAtomValue } from 'jotai';
import memoize from 'memoize-one';
import FlagButton from './flag-button';
import {
  itemHeightAtom,
  promptDataAtom,
  isScrollingAtom,
  flagsListAtom,
  flagsIndexAtom,
  flagsRequiresScrollAtom,
  scoredFlagsAtom,
} from '../jotai';
import { ChoiceButtonProps, ListProps } from '../types';

const createItemData = memoize(
  (choices) =>
    ({
      choices,
    } as ChoiceButtonProps['data'])
);

export default function FlagsList({ height }: ListProps) {
  const flagsRef = useRef(null);
  const innerRef = useRef(null);
  // TODO: In case items ever have dynamic height
  const [choices] = useAtom(scoredFlagsAtom);
  const [index, onIndexChange] = useAtom(flagsIndexAtom);
  // const [inputValue] = useAtom(inputAtom);
  // const [mainHeight, setMainHeight] = useAtom(mainHeightAtom);
  const itemHeight = useAtomValue(itemHeightAtom);
  const promptData = useAtomValue(promptDataAtom);
  const [list, setList] = useAtom(flagsListAtom);
  const [requiresScroll, setRequiresScroll] = useAtom(flagsRequiresScrollAtom);
  const [isScrolling, setIsScrolling] = useAtom(isScrollingAtom);

  const itemData = createItemData(choices);

  useEffect(() => {
    if (flagsRef.current) {
      setList(flagsRef.current);
    }
  }, [setList]);

  useEffect(() => {
    if (!flagsRef.current) return;

    const scroll = () => {
      if (requiresScroll === -1) return;
      onIndexChange(requiresScroll);
      (flagsRef as any).current.scrollToItem(
        requiresScroll,
        // eslint-disable-next-line no-nested-ternary
        requiresScroll > 0 ? 'auto' : 'start'
      );
    };

    scroll();
    setTimeout(() => {
      if (flagsRef.current) {
        scroll();
        setRequiresScroll(-1);
      }
    }, 100);
  }, [requiresScroll, choices]);

  useEffect(() => {
    if (!flagsRef.current) return;
    const needsReset = choices.find((c) => c?.item?.height !== itemHeight);
    if (needsReset) {
      (flagsRef?.current as any)?.resetAfterIndex(0);
    }
  }, [choices, itemHeight]);

  const [scrollTimeout, setScrollTimeout] = useState<any>(null);

  const choicesHeight = choices.reduce((acc, choice) => {
    return acc + (choice?.item?.height || itemHeight);
  }, 0);
  return (
    <div
      id="flags"
      className="flags-component flex w-full flex-row overflow-y-hidden"
    >
      <List
        ref={flagsRef}
        innerRef={innerRef}
        overscanCount={2}
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
              Math.min(height, choicesHeight)
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
        {FlagButton}
      </List>
    </div>
  );
}
