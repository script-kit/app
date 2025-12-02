import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import { type CSSProperties, type ReactElement, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { List, type RowComponentProps, useListCallbackRef } from 'react-window';
import type { ScoredChoice } from '../../../shared/types';
import {
  actionsInputHeightAtom,
  actionsItemHeightAtom,
  closeActionsOverlayAtom,
  flagsHeightAtom,
  flagsIndexAtom,
  flagsListAtom,
  focusedElementAtom,
  inputAtom,
  isFlagsScrollingAtom,
  scoredFlagsAtom,
} from '../jotai';
import { registerScrollRefAtom } from '../state/scroll';
import ActionsInput from './actions-input';
import FlagButton from './flag-button';

// Row props type for List v2 API
interface FlagsListRowProps {
  choices: ScoredChoice[];
  input: string;
}

// Row component for List (v2 API)
function FlagsRowComponent({ index, style, choices, input }: RowComponentProps<FlagsListRowProps>): ReactElement {
  return <FlagButton index={index} style={style} choices={choices} input={input} />;
}

function InnerList({ height }: { height: number }) {
  // v2 API: use callback ref for imperative API
  const [listApi, setListApi] = useListCallbackRef();

  const [choices] = useAtom(scoredFlagsAtom);
  const [index, onIndexChange] = useAtom(flagsIndexAtom);
  const itemHeight = useAtomValue(actionsItemHeightAtom);
  const input = useAtomValue(inputAtom);
  const [list, setList] = useAtom(flagsListAtom);
  const [isScrolling, setIsScrolling] = useAtom(isFlagsScrollingAtom);
  const registerScrollRef = useSetAtom(registerScrollRefAtom);

  // Register list ref with scroll service and flagsListAtom when it changes
  // The scrollToItem wrapper is called directly from flagsIndexAtom setter (bypassing scrollRequestAtom)
  useEffect(() => {
    if (!listApi) return;

    // Create a wrapper object that jotai.ts can call directly
    const scrollWrapper = {
      scrollToItem: (idx: number, align?: string) => {
        listApi.scrollToRow({ index: idx, align: (align || 'auto') as any });
      },
      // Legacy method name alias
      resetAfterIndex: () => {
        // v2 doesn't need this - it handles sizing automatically
      },
    };
    setList(scrollWrapper as any);
    registerScrollRef({ context: 'flags-list', ref: scrollWrapper });
  }, [listApi, setList, registerScrollRef]);

  // Scroll to current index whenever listApi becomes available or index changes
  // This handles the race condition where flagsIndexAtom setter fires before the list mounts
  useEffect(() => {
    if (!listApi || typeof index !== 'number' || index < 0 || !choices?.length) {
      return;
    }

    // Scroll to bring the focused item into view
    listApi.scrollToRow({ index, align: 'auto' });
  }, [listApi, index, choices?.length]);

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

  // v2 API: row height function receives index and rowProps
  const rowHeightFn = useCallback(
    (i: number, rowProps: FlagsListRowProps) => {
      const maybeHeight = rowProps.choices?.[i]?.item?.height;
      return typeof maybeHeight === 'number' ? maybeHeight : itemHeight;
    },
    [itemHeight],
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

  // v2 row props
  const rowProps: FlagsListRowProps = useMemo(() => ({ choices, input }), [choices, input]);

  // Style with explicit dimensions for v2
  const listStyle: CSSProperties = useMemo(
    () => ({
      width: '100%',
      height,
    }),
    [height],
  );

  return (
    <List<FlagsListRowProps>
      listRef={setListApi}
      rowComponent={FlagsRowComponent}
      rowProps={rowProps}
      className={listClassName}
      style={listStyle}
      rowCount={choices?.length || 0}
      rowHeight={rowHeightFn}
      overscanCount={2}
    />
  );
}

export default function ActionsList() {
  const inputHeight = useAtomValue(actionsInputHeightAtom);
  const actionsHeight = useAtomValue(flagsHeightAtom);
  const [prevFocusedElement] = useAtom(focusedElementAtom);
  const closeOverlay = useSetAtom(closeActionsOverlayAtom);
  const componentRef = useRef<HTMLDivElement>(null);

  // Calculate the effective list height
  // CSS max-h-[80vh] constrains the container, so we need to cap the list height accordingly
  // Container max = 80vh, minus input height, borders, and padding (~50px buffer)
  const maxListHeight = Math.floor(window.innerHeight * 0.8) - inputHeight - 50;
  const effectiveListHeight = Math.min(actionsHeight, Math.max(maxListHeight, 100));

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
      height: effectiveListHeight + inputHeight + 2,
      minHeight: inputHeight,
    }),
    [effectiveListHeight, inputHeight],
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
      {effectiveListHeight > 0 && (
        <div className="flex-1" style={{ height: effectiveListHeight }}>
          <InnerList height={effectiveListHeight} />
        </div>
      )}
    </div>
  );
}
