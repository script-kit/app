import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import memoize from 'memoize-one';
/* eslint-disable react-hooks/exhaustive-deps */
/* eslint-disable react/require-default-props */
import { useEffect, useRef, useState, useCallback } from 'react';
import AutoSizer from 'react-virtualized-auto-sizer';
import { VariableSizeList as List } from 'react-window';
import type { ChoiceButtonProps } from '../../../shared/types';
import {
  actionsInputHeightAtom,
  actionsItemHeightAtom,
  flaggedChoiceValueAtom,
  flagsHeightAtom,
  flagsIndexAtom,
  flagsListAtom,
  flagsRequiresScrollAtom,
  focusedElementAtom,
  isFlagsScrollingAtom,
  scoredFlagsAtom,
} from '../jotai';
import ActionsInput from './actions-input';
import FlagButton from './flag-button';

const createItemData = memoize(
  (choices) =>
    ({
      choices,
    }) as ChoiceButtonProps['data'],
);

function InnerList({ height }) {
  const flagsRef = useRef<null | List>(null);
  const innerRef = useRef(null);
  // TODO: In case items ever have dynamic height
  const [choices] = useAtom(scoredFlagsAtom);
  const [index, onIndexChange] = useAtom(flagsIndexAtom);
  // const [inputValue] = useAtom(inputAtom);
  // const [mainHeight, setMainHeight] = useAtom(mainHeightAtom);
  const itemHeight = useAtomValue(actionsItemHeightAtom);

  const [list, setList] = useAtom(flagsListAtom);
  const [requiresScroll, setRequiresScroll] = useAtom(flagsRequiresScrollAtom);
  const [isScrolling, setIsScrolling] = useAtom(isFlagsScrollingAtom);

  const itemData = createItemData(choices);

  useEffect(() => {
    if (flagsRef.current) {
      setList(flagsRef.current);
    }
  }, [flagsRef.current]);

  useEffect(() => {
    if (!flagsRef.current) {
      return;
    }

    const scroll = () => {
      if (requiresScroll === -1) {
        return;
      }
      onIndexChange(requiresScroll);
      flagsRef?.current?.scrollToItem(
        requiresScroll,
        // eslint-disable-next-line no-nested-ternary
        requiresScroll > 0 ? 'auto' : 'start',
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
    if (!flagsRef.current) {
      return;
    }
    const needsReset = choices.find((c) => c?.item?.height !== itemHeight);
    if (needsReset) {
      (flagsRef?.current as any)?.resetAfterIndex(0);
    }
  }, [choices, itemHeight]);

  const [scrollTimeout, setScrollTimeout] = useState<any>(null);

  const handleScroll = useCallback(() => {
    if (index === 0 || index === 1) {
      setIsScrolling(false);
    } else {
      setIsScrolling(true);
    }

    // Clear the previous timeout
    if (scrollTimeout) {
      clearTimeout(scrollTimeout);
    }

    // Set a new timeout
    const newTimeout = setTimeout(() => {
      setIsScrolling(false);
    }, 250);

    setScrollTimeout(newTimeout);
  }, [index, scrollTimeout, setIsScrolling]);

  return (
    <List
      width={'100%'}
      height={height}
      ref={flagsRef}
      innerRef={innerRef}
      overscanCount={2}
      onScroll={handleScroll}
      itemCount={choices?.length || 0}
      itemSize={(i) => {
        const maybeHeight = choices?.[i]?.item?.height;

        const height = typeof maybeHeight === 'number' ? maybeHeight : itemHeight;
        // log.info(
        //   `📜 Item ${i}: Name: ${choices?.[i]?.item?.name} height: ${height}`
        // );
        return height;
      }}
      itemKey={(i, data) => {
        const id = data?.choices?.[i]?.item?.id;
        return id || i;
      }}
      itemData={itemData}
      className={`
${isScrolling ? 'scrollbar' : ''}
wrapper
px-0
text-text-base outline-none focus:border-none focus:outline-none
w-full
`}
      // onItemsRendered={onItemsRendered}
    >
      {FlagButton}
    </List>
  );
}

export default function ActionsList() {
  const inputHeight = useAtomValue(actionsInputHeightAtom);
  const actionsHeight = useAtomValue(flagsHeightAtom);
  const [prevFocusedElement] = useAtom(focusedElementAtom);
  const setFlagValue = useSetAtom(flaggedChoiceValueAtom);
  const componentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (componentRef.current && !componentRef.current.contains(event.target as Node)) {
        setFlagValue('');
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      if (prevFocusedElement instanceof HTMLElement) {
        prevFocusedElement.focus();
      }
    };
  }, [prevFocusedElement, setFlagValue]);

  return (
    <div
      id="actions"
      ref={componentRef}
      className="
      z-50
      flags-component flex w-96 flex-col overflow-y-hidden
      max-h-[80vh]
      absolute
      top-9
      transform
      left-1/2
      -translate-x-1/2
      origin-top
      rounded-lg
      bg-bg-base/90
      backdrop-filter
      backdrop-blur-xl
      border border-ui-border
      shadow-lg
      "
      style={{
        height: actionsHeight + inputHeight + 2, // 2px for the border, hmm....
        minHeight: inputHeight,
      }}
    >
      <ActionsInput />
      <div className="flex h-full">
        <div className="flex-1">
          <AutoSizer disableWidth={true} className="w-full">
            {({ height }) => (
              <>
                <InnerList height={height + 2} />
              </>
            )}
          </AutoSizer>
        </div>
      </div>
    </div>
  );
}
