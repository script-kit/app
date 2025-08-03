import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
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
} from "../state";
import ActionsInput from './actions-input';
import FlagButton from './flag-button';

function InnerList({ height }: { height: number }) {
  const flagsRef = useRef<null | List>(null);
  const innerRef = useRef(null);
  const [choices] = useAtom(scoredFlagsAtom);
  const [index, onIndexChange] = useAtom(flagsIndexAtom);
  const itemHeight = useAtomValue(actionsItemHeightAtom);
  const [list, setList] = useAtom(flagsListAtom);
  const [requiresScroll, setRequiresScroll] = useAtom(flagsRequiresScrollAtom);
  const [isScrolling, setIsScrolling] = useAtom(isFlagsScrollingAtom);

  const handleFlagsRef = useCallback(
    (node) => {
      if (node) {
        setList(node);
        flagsRef.current = node;
      }
    },
    [setList],
  );

  const itemData = useMemo(() => ({ choices }), [choices]);

  useEffect(() => {
    if (!flagsRef.current) return;

    const scroll = () => {
      if (requiresScroll === -1) return;

      onIndexChange(requiresScroll);
      flagsRef.current?.scrollToItem(requiresScroll, requiresScroll > 0 ? 'auto' : 'start');
    };

    scroll();
    requestAnimationFrame(() => {
      if (flagsRef.current) {
        scroll();
        setRequiresScroll(-1);
      }
    });
  }, [requiresScroll, choices.length, onIndexChange, setRequiresScroll]);

  useEffect(() => {
    if (!flagsRef.current) return;
    
    const needsReset = choices.some(c => c?.item?.height !== itemHeight);
    if (needsReset) {
      flagsRef.current?.resetAfterIndex(0);
    }
  }, [choices.length, itemHeight]);

  const [scrollTimeout, setScrollTimeout] = useState<NodeJS.Timeout | null>(null);

  const handleScroll = useCallback(() => {
    if (index <= 1) {
      setIsScrolling(false);
    } else {
      setIsScrolling(true);
    }

    if (scrollTimeout) {
      clearTimeout(scrollTimeout);
    }

    const newTimeout = setTimeout(() => {
      setIsScrolling(false);
    }, 250);

    setScrollTimeout(newTimeout);
  }, [index, scrollTimeout, setIsScrolling]);

  const itemSize = useMemo(
    () => {
      // Pre-calculate all item sizes to avoid repeated calculations
      const sizes = new Map<number, number>();
      return (i: number) => {
        if (sizes.has(i)) {
          return sizes.get(i)!;
        }
        const maybeHeight = choices?.[i]?.item?.height;
        const height = typeof maybeHeight === 'number' ? maybeHeight : itemHeight;
        sizes.set(i, height);
        return height;
      };
    },
    [choices, itemHeight],
  );

  const itemKey = useCallback(
    (i: number, data: ChoiceButtonProps['data']) => data?.choices?.[i]?.item?.id || i,
    [],
  );

  const listClassName = useMemo(
    () => `
      ${isScrolling ? 'scrollbar' : ''}
      wrapper
      px-0
      text-text-base outline-none focus:border-none focus:outline-none
      w-full
    `,
    [isScrolling],
  );

  return (
    <List
      width="100%"
      height={height}
      ref={handleFlagsRef}
      innerRef={innerRef}
      overscanCount={2}
      onScroll={handleScroll}
      itemCount={choices?.length || 0}
      itemSize={itemSize}
      itemKey={itemKey}
      itemData={itemData}
      className={listClassName}
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
    if (!componentRef.current) return;

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

  const containerStyle = useMemo(
    () => ({
      height: actionsHeight + inputHeight + 2,
      minHeight: inputHeight,
    }),
    [actionsHeight, inputHeight],
  );

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
        bg-bg-base/95
        backdrop-filter
        backdrop-blur-xl
        border border-ui-border
        shadow-lg
      "
      style={containerStyle}
    >
      <ActionsInput />
      <div className="flex h-full">
        <div className="flex-1">
          <AutoSizer disableWidth={true} className="w-full">
            {({ height }) => <InnerList height={height + 2} />}
          </AutoSizer>
        </div>
      </div>
    </div>
  );
}
