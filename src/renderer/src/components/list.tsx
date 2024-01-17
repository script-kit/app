/* eslint-disable react-hooks/exhaustive-deps */
/* eslint-disable react/require-default-props */
import React, { useEffect, useRef, useState } from 'react';
import log from 'electron-log';
import { VariableSizeList as List } from 'react-window';
import { useAtom, useAtomValue } from 'jotai';
import memoize from 'memoize-one';
import ChoiceButton from './button';
import {
  indexAtom,
  scoredChoicesAtom,
  itemHeightAtom,
  promptDataAtom,
  listAtom,
  requiresScrollAtom,
  isScrollingAtom,
  flaggedChoiceValueAtom,
  logAtom,
  currentChoiceHeightsAtom,
} from '../jotai';
import { ChoiceButtonProps, ListProps } from '../../../shared/types';

const createItemData = memoize(
  (choices) =>
    ({
      choices,
    }) as ChoiceButtonProps['data']
);

export default function ChoiceList({ height }: ListProps) {
  const listRef = useRef<null | List>(null);
  const innerRef = useRef(null);
  // TODO: In case items ever have dynamic height
  const [choices] = useAtom(scoredChoicesAtom);
  const [index, onIndexChange] = useAtom(indexAtom);
  // const [inputValue] = useAtom(inputAtom);
  // const [mainHeight, setMainHeight] = useAtom(mainHeightAtom);
  const itemHeight = useAtomValue(itemHeightAtom);
  const promptData = useAtomValue(promptDataAtom);
  const [list, setList] = useAtom(listAtom);
  const [requiresScroll, setRequiresScroll] = useAtom(requiresScrollAtom);
  const [isScrolling, setIsScrolling] = useAtom(isScrollingAtom);
  const flagValue = useAtomValue(flaggedChoiceValueAtom);

  const currentChoiceHeights = useAtomValue(currentChoiceHeightsAtom);

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
      log.verbose(`📜 Scrolling to ${requiresScroll}`);
      (listRef as any).current.scrollToItem(
        requiresScroll,
        // eslint-disable-next-line no-nested-ternary
        requiresScroll > 0 ? 'auto' : 'start'
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

    // log.info(`🧾 List reset due to choice height changes`);
    listRef?.current?.resetAfterIndex(0);
  }, [choices, promptData, flagValue]);

  const [scrollTimeout, setScrollTimeout] = useState<any>(null);

  // const choicesHeight = choices.reduce((acc, choice) => {
  //   return acc + (choice?.item?.height || itemHeight);
  // }, 0);

  const itemData = createItemData(choices);

  return (
    <div
      id="list"
      className="list-component flex w-full flex-row overflow-y-hidden"
    >
      <List
        ref={listRef}
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
          height
          // promptData?.resize
          //   ? // TODO: add itemHeight to choices in Kit SDK
          //     Math.min(height, choicesHeight)
          //   : height
        }
        itemCount={choices?.length || 0}
        itemSize={(i) => {
          const maybeHeight = choices?.[i]?.item?.height;

          const height =
            typeof maybeHeight === 'number' ? maybeHeight : itemHeight;
          // log.info(
          //   `📜 Item ${i}: Name: ${choices?.[i]?.item?.name} height: ${height}`
          // );
          return height;
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
