import { hotkeysOptions } from '@renderer/hooks/shared';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useHotkeys } from 'react-hotkeys-hook';
import { VariableSizeGrid as Grid, type GridOnItemsRenderedProps, VariableSizeList as List } from 'react-window';
import type { ChoiceButtonProps, ListProps } from '../../../shared/types';
import useListNav from '../hooks/useListNav';
import {
  containerClassNameAtom,
  directionAtom,
  gridReadyAtom,
  indexAtom,
  isScrollingAtom,
  itemHeightAtom,
  listAtom,
  mouseEnabledAtom,
  promptDataAtom,
  scoredChoicesAtom,
} from '../jotai';
import { createLogger } from '../log-utils';
import { gridDimensionsAtom, registerScrollRefAtom, setScrollingAtom } from '../state/scroll';
import ChoiceButton from './button';

const log = createLogger('List.tsx');

function calculateColumnWidth(totalWidth: number, columnCount: number, cellGap: number, providedColumnWidth?: number) {
  if (providedColumnWidth) {
    return providedColumnWidth;
  }
  const totalGapSpace = cellGap * (columnCount - 2);
  const availableSpace = totalWidth - totalGapSpace;
  const calculatedColumnWidth = availableSpace / columnCount;
  return Math.max(calculatedColumnWidth, 1);
}

export default function ChoiceList({ width, height }: ListProps) {
  const listRef = useRef<null | List>(null);
  const [choices] = useAtom(scoredChoicesAtom);
  const [index, setIndex] = useAtom(indexAtom);
  const itemHeight = useAtomValue(itemHeightAtom);
  const promptData = useAtomValue(promptDataAtom);
  const [list, setList] = useAtom(listAtom);
  const [isScrolling, setIsScrolling] = useAtom(isScrollingAtom);
  const setMouseEnabled = useSetAtom(mouseEnabledAtom);
  const gridReady = useAtomValue(gridReadyAtom);
  const containerClassName = useAtomValue(containerClassNameAtom);

  // Unified nav adapter for grid: we compute the target index and dispatch SET
  const nav = useListNav({
    id: 'choices-grid',
    getCount: () => choices.length,
    getIndex: () => index,
    setIndex: (next) => setIndex(next),
    loop: true,
  });

  const registerScrollRef = useSetAtom(registerScrollRefAtom);
  const setGridDimensions = useSetAtom(gridDimensionsAtom);
  const setScrolling = useSetAtom(setScrollingAtom);

  const handleListRef = useCallback(
    (node) => {
      if (node) {
        setList(node);
        listRef.current = node;
        // Register with scroll service
        registerScrollRef({ context: gridReady ? 'choices-grid' : 'choices-list', ref: node });
      }
    },
    [setList, registerScrollRef, gridReady],
  );

  // REMOVED: Old scroll effect that watched requiresScrollAtom
  // Scrolling is now handled by the unified scroll service

  useEffect(() => {
    if (!listRef?.current) return;
    if (typeof listRef.current.resetAfterIndex === 'function') {
      listRef.current.resetAfterIndex(0);
    }
  }, [choices.length]);

  const [scrollTimeout, setScrollTimeout] = useState<NodeJS.Timeout | null>(null);

  const itemData = useMemo(
    () => ({
      choices,
    }),
    [choices],
  );

  const commonProps = useMemo(
    () => ({
      width,
      height,
      itemData,
      className: `
      ${gridReady ? 'grid' : 'list'}
      ${isScrolling ? 'scrollbar' : ''}
wrapper
bg-opacity-20
px-0
text-text-base outline-none focus:border-none focus:outline-none
${containerClassName}
    `,
    }),
    [width, height, itemData, gridReady, isScrolling, containerClassName],
  );

  const CELL_GAP = promptData?.gridGap ? promptData.gridGap / 2 : 0;

  const gridDimensions = useMemo(() => {
    const minColumnWidth = promptData?.columnWidth ?? 100;
    const columnCount = Math.max(
      1,
      promptData?.columns ?? Math.min(choices.length, Math.floor(width / (promptData?.columnWidth ?? minColumnWidth))),
    );

    const columnWidth = calculateColumnWidth(width, columnCount, CELL_GAP, promptData?.columnWidth);
    const rowHeight = promptData?.rowHeight ?? promptData?.columnWidth ?? columnWidth;

    return {
      minColumnWidth,
      columnCount,
      rowCount: Math.max(1, Math.ceil(choices.length / columnCount)),
      columnWidth,
      rowHeight,
    };
  }, [choices.length, width, promptData?.columnWidth, promptData?.rowHeight, promptData?.columns, CELL_GAP]);

  // Register grid dimensions with scroll service
  useEffect(() => {
    if (gridReady && gridDimensions) {
      setGridDimensions({
        columnCount: gridDimensions.columnCount,
        rowHeight: gridDimensions.rowHeight,
        columnWidth: gridDimensions.columnWidth,
      });
    }
  }, [gridReady, gridDimensions, setGridDimensions]);

  const gridRef = useRef<Grid>(null);

  // Tracks whether we've already resolved the initial index for the current prompt.
  const hasResolvedInitialIndexRef = useRef(false);
  const lastPromptKeyRef = useRef<string | null>(null);

  // Register grid ref with scroll service
  useEffect(() => {
    if (gridRef?.current && gridReady) {
      registerScrollRef({ context: 'choices-grid', ref: gridRef.current });
      gridRef.current.resetAfterIndices({
        columnIndex: 0,
        rowIndex: 0,
        shouldForceUpdate: true,
      });
    }
  }, [gridRef.current, gridReady, registerScrollRef]);

  useEffect(() => {
    if (gridRef?.current) {
      gridRef.current.resetAfterIndices({
        columnIndex: 0,
        rowIndex: 0,
        shouldForceUpdate: true,
      });
    }
  }, [choices, promptData?.columnWidth, promptData?.rowHeight]);

  const columnWidthCallback = useCallback(
    (index: number) => choices[index]?.item?.width || gridDimensions?.columnWidth,
    [choices, gridDimensions?.columnWidth],
  );

  const rowHeightCallback = useCallback(
    (index: number) => choices[index]?.item?.height || gridDimensions.rowHeight,
    [choices, gridDimensions.rowHeight],
  );

  const currentColumn = index % gridDimensions.columnCount;
  const currentRow = Math.floor(index / gridDimensions.columnCount);

  useHotkeys(
    ['up', 'down', 'left', 'right'],
    (event) => {
      if (!gridReady) return;

      setMouseEnabled(0);
      let newIndex = index;

      switch (event.key) {
        case 'ArrowLeft':
          if (currentColumn > 0) {
            newIndex = currentRow * gridDimensions.columnCount + (currentColumn - 1);
          }
          break;
        case 'ArrowRight':
          if (currentColumn < gridDimensions.columnCount - 1) {
            newIndex = Math.min(currentRow * gridDimensions.columnCount + (currentColumn + 1), choices.length - 1);
          }
          break;
        case 'ArrowUp':
          if (currentRow > 0) {
            newIndex = (currentRow - 1) * gridDimensions.columnCount + currentColumn;
          }
          break;
        case 'ArrowDown':
          if (currentRow < gridDimensions.rowCount - 1) {
            newIndex = Math.min(choices.length - 1, (currentRow + 1) * gridDimensions.columnCount + currentColumn);
          }
          break;
        default:
          log.info(`Unknown direction key in ChoiceList.tsx:`, event);
          break;
      }

      if (newIndex !== index) {
        nav.dispatch({ type: 'SET', index: newIndex, source: 'key' });
      }
    },
    hotkeysOptions,
    [
      currentColumn,
      currentRow,
      gridDimensions.columnCount,
      gridDimensions.rowCount,
      gridReady,
      choices.length,
      index,
      nav,
      setMouseEnabled,
    ],
  );

  const [renderedProps, setRenderedProps] = useState<GridOnItemsRenderedProps>();

  const handleScroll = useCallback(() => {
    if (index === 0 || index === 1) {
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

  // Resolve the initial index once we have any selection/focus hints.
  // This avoids locking in index 0 when choices arrive before promptData.
  useEffect(() => {
    if (!choices.length) return;

    // Detect prompt changes so we can re-run for a new script.
    const promptKey = promptData?.id || promptData?.key || null;
    if (lastPromptKeyRef.current !== promptKey) {
      hasResolvedInitialIndexRef.current = false;
      lastPromptKeyRef.current = promptKey;
    }

    // If we've already resolved for this prompt, don't touch the index again.
    if (hasResolvedInitialIndexRef.current) return;

    const getIndexByPredicate = (predicate: (item: any) => boolean) =>
      choices.findIndex((choice) => choice?.item && predicate(choice.item));

    // Do we have any hints at all yet?
    const hasChoiceSelected = getIndexByPredicate((item) => item.selected === true) >= 0;

    const hasPromptHint =
      !!promptData?.focusedId || !!promptData?.defaultChoiceId || !!promptData?.focused || !!promptData?.selected;

    log.info('[INITIAL_INDEX_DEBUG] Checking hints', {
      promptId: promptData?.id,
      hasChoiceSelected,
      hasPromptHint,
      promptDataSelected: promptData?.selected,
      promptDataFocused: promptData?.focused,
      promptDataFocusedId: promptData?.focusedId,
      promptDataDefaultChoiceId: promptData?.defaultChoiceId,
      choicesWithSelected: choices.filter((c) => c?.item?.selected).map((c) => c?.item?.name),
      totalChoices: choices.length,
    });

    // If no hints exist yet, don't commit to an index.
    // Wait for promptData or choices to change again.
    if (!hasChoiceSelected && !hasPromptHint) {
      log.info('[INITIAL_INDEX_DEBUG] No hints yet, waiting...');
      return;
    }

    let nextIndex = -1;

    // 1. Per-choice selected flag
    if (hasChoiceSelected) {
      nextIndex = getIndexByPredicate((item) => item.selected === true);
    }

    // 2. PromptData.focusedId
    if (nextIndex < 0 && promptData?.focusedId) {
      nextIndex = getIndexByPredicate((item) => item.id === promptData.focusedId);
    }

    // 3. PromptData.defaultChoiceId
    if (nextIndex < 0 && promptData?.defaultChoiceId) {
      nextIndex = getIndexByPredicate((item) => item.id === promptData.defaultChoiceId);
    }

    // 4. Legacy string-based hints (focused / selected)
    const legacyKeys: string[] = [];
    if (promptData?.focused) legacyKeys.push(promptData.focused);
    if (promptData?.selected) legacyKeys.push(promptData.selected);

    if (nextIndex < 0 && legacyKeys.length) {
      for (const key of legacyKeys) {
        nextIndex = getIndexByPredicate((item) => item.name === key || item.value === key || item.id === key);
        if (nextIndex >= 0) break;
      }
    }

    // If hints exist but none match, we intentionally do NOT override whatever
    // index the nav system has already chosen. Just mark as resolved.
    if (nextIndex < 0) {
      log.info('[INITIAL_INDEX_DEBUG] Hints exist but no match found, keeping current index');
      hasResolvedInitialIndexRef.current = true;
      return;
    }

    log.info('[INITIAL_INDEX_DEBUG] Resolved to index', {
      nextIndex,
      choiceName: choices[nextIndex]?.item?.name,
    });

    setIndex(nextIndex);
    hasResolvedInitialIndexRef.current = true;
  }, [choices, promptData, setIndex]);

  return (
    <div id="list" style={{ width }} className="list-component flex flex-col w-full overflow-y-hidden">
      {gridReady ? (
        <Grid
          {...commonProps}
          onItemsRendered={setRenderedProps}
          ref={gridRef}
          height={height}
          columnCount={gridDimensions.columnCount}
          rowCount={gridDimensions.rowCount}
          columnWidth={columnWidthCallback}
          rowHeight={rowHeightCallback}
          width={width}
        >
          {({ columnIndex, rowIndex, style, data }) => {
            const index = rowIndex * gridDimensions.columnCount + columnIndex;
            if (index >= choices.length || !renderedProps) {
              return null;
            }

            const focusedOnLastRow = currentRow === renderedProps.visibleRowStopIndex;
            const gappedStyle = {
              ...style,
              left: columnIndex === 0 ? style.left : Number(style.left) + columnIndex * CELL_GAP,
              top:
                Number(style.top) +
                (rowIndex -
                  (focusedOnLastRow ? renderedProps.visibleRowStopIndex - 1 : renderedProps.visibleRowStartIndex)) *
                  CELL_GAP,
              width: Number(style.width) - CELL_GAP,
              height: Number(style.height) - CELL_GAP,
            };

            return <ChoiceButton index={index} style={gappedStyle} data={data} />;
          }}
        </Grid>
      ) : (
        <List
          {...commonProps}
          ref={handleListRef}
          overscanCount={2}
          itemCount={choices?.length || 0}
          itemSize={(i) => choices?.[i]?.item?.height || itemHeight}
          onScroll={handleScroll}
          itemKey={(i, data) => data?.choices?.[i]?.item?.id || i}
          width="100%"
        >
          {ChoiceButton}
        </List>
      )}
    </div>
  );
}
