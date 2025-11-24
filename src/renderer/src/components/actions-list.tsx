import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import AutoSizer from 'react-virtualized-auto-sizer';
import { VariableSizeList as List } from 'react-window';
import type { ChoiceButtonProps } from '../../../shared/types';
import {
  actionsInputHeightAtom,
  actionsItemHeightAtom,
  closeActionsOverlayAtom,
  flagsHeightAtom,
  flagsIndexAtom,
  flagsListAtom,
  focusedElementAtom,
  isFlagsScrollingAtom,
  scoredFlagsAtom,
} from '../jotai';
import { registerScrollRefAtom } from '../state/scroll';
import ActionsInput from './actions-input';
import FlagButton from './flag-button';

function InnerList({ height }: { height: number }) {
  const flagsRef = useRef<null | List>(null);
  const innerRef = useRef(null);
  const [choices] = useAtom(scoredFlagsAtom);
  const [index, onIndexChange] = useAtom(flagsIndexAtom);
  const itemHeight = useAtomValue(actionsItemHeightAtom);
  const [list, setList] = useAtom(flagsListAtom);
  const [isScrolling, setIsScrolling] = useAtom(isFlagsScrollingAtom);
  const registerScrollRef = useSetAtom(registerScrollRefAtom);

  const handleFlagsRef = useCallback(
    (node) => {
      if (node) {
        setList(node);
        flagsRef.current = node;
        // Register with scroll service
        registerScrollRef({ context: 'flags-list', ref: node });
      }
    },
    [setList, registerScrollRef],
  );

  const itemData = useMemo(() => ({ choices }), [choices]);

  // REMOVED: Old scroll effect that watched flagsRequiresScrollAtom
  // Scrolling is now handled by the unified scroll service

  useEffect(() => {
    if (!flagsRef.current) return;

    const needsReset = choices.some((c) => c?.item?.height !== itemHeight);
    if (needsReset) {
      flagsRef.current?.resetAfterIndex(0);
    }
  }, [choices.length, itemHeight]);

  // When the flags list is first populated, choose a sensible initial index
  // based on any per-choice selected flag, falling back to the first item.
  useEffect(() => {
    if (!choices?.length) return;

    if (typeof index === 'number' && index >= 0 && index < choices.length) {
      return;
    }

    const selectedIndex = choices.findIndex((c) => c?.item?.selected === true);
    const nextIndex = selectedIndex >= 0 ? selectedIndex : 0;

    onIndexChange(nextIndex);
  }, [choices, index, onIndexChange]);

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

  const itemSize = useMemo(() => {
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
  }, [choices, itemHeight]);

  const itemKey = useCallback((i: number, data: ChoiceButtonProps['data']) => data?.choices?.[i]?.item?.id || i, []);

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
  const closeOverlay = useSetAtom(closeActionsOverlayAtom);
  const componentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!componentRef.current) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (componentRef.current && !componentRef.current.contains(event.target as Node)) {
        closeOverlay();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      if (prevFocusedElement instanceof HTMLElement) {
        prevFocusedElement.focus();
      }
    };
  }, [prevFocusedElement, closeOverlay]);

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
