import { hotkeysOptions } from '@renderer/hooks/shared';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactElement } from 'react';
import { useHotkeys } from 'react-hotkeys-hook';
import { Grid, List, useGridCallbackRef, useListCallbackRef, type GridImperativeAPI, type ListImperativeAPI, type RowComponentProps, type CellComponentProps } from 'react-window';
import type { ListProps, ScoredChoice } from '../../../shared/types';
import useListNav from '../hooks/useListNav';
import {
  containerClassNameAtom,
  directionAtom,
  gridReadyAtom,
  indexAtom,
  inputAtom,
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

// Row props type for List
interface ChoiceListRowProps {
  choices: ScoredChoice[];
  input: string;
}

// Cell props type for Grid
interface ChoiceGridCellProps {
  choices: ScoredChoice[];
  input: string;
  gridDimensions: {
    columnCount: number;
    rowCount: number;
    columnWidth: number;
    rowHeight: number;
  };
  cellGap: number;
  currentRow: number;
  renderedProps: {
    visibleRowStartIndex: number;
    visibleRowStopIndex: number;
  } | null;
}

// Row height function for List - gets index and rowProps
function getRowHeight(index: number, { choices }: ChoiceListRowProps, defaultHeight: number): number {
  return choices?.[index]?.item?.height || defaultHeight;
}

// Row component for List (v2 API)
function ListRowComponent({ index, style, choices, input }: RowComponentProps<ChoiceListRowProps>): ReactElement {
  return <ChoiceButton index={index} style={style} choices={choices} input={input} />;
}

// Cell component for Grid (v2 API)
function GridCellComponent({
  columnIndex,
  rowIndex,
  style,
  choices,
  input,
  gridDimensions,
  cellGap,
  currentRow,
  renderedProps
}: CellComponentProps<ChoiceGridCellProps>): ReactElement | null {
  const index = rowIndex * gridDimensions.columnCount + columnIndex;

  if (index >= choices.length || !renderedProps) {
    return null;
  }

  const focusedOnLastRow = currentRow === renderedProps.visibleRowStopIndex;
  const gappedStyle: CSSProperties = {
    ...style,
    left: columnIndex === 0 ? style.left : Number(style.left) + columnIndex * cellGap,
    top:
      Number(style.top) +
      (rowIndex -
        (focusedOnLastRow ? renderedProps.visibleRowStopIndex - 1 : renderedProps.visibleRowStartIndex)) *
        cellGap,
    width: Number(style.width) - cellGap,
    height: Number(style.height) - cellGap,
  };

  return <ChoiceButton index={index} style={gappedStyle} choices={choices} input={input} />;
}

export default function ChoiceList({ width, height }: ListProps) {
  // v2 API: use callback refs for imperative API
  const [listApi, setListApi] = useListCallbackRef();
  const [gridApi, setGridApi] = useGridCallbackRef();

  const [choices] = useAtom(scoredChoicesAtom);
  const [index, setIndex] = useAtom(indexAtom);
  const input = useAtomValue(inputAtom);
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

  // Register list ref with scroll service when it changes
  useEffect(() => {
    if (listApi && !gridReady) {
      // Create a wrapper object compatible with the scroll service
      const scrollWrapper = {
        scrollToItem: (index: number, align?: string) => {
          listApi.scrollToRow({ index, align: (align as any) || 'auto' });
        },
      };
      setList(scrollWrapper as any);
      registerScrollRef({ context: 'choices-list', ref: scrollWrapper });
    }
  }, [listApi, gridReady, setList, registerScrollRef]);

  // Register grid ref with scroll service when it changes
  useEffect(() => {
    if (gridApi && gridReady) {
      // Create a wrapper object compatible with the scroll service
      const scrollWrapper = {
        scrollToItem: ({ rowIndex, columnIndex, align }: { rowIndex: number; columnIndex: number; align?: string }) => {
          gridApi.scrollToCell({ rowIndex, columnIndex, rowAlign: (align as any) || 'auto', columnAlign: (align as any) || 'auto' });
        },
      };
      registerScrollRef({ context: 'choices-grid', ref: scrollWrapper });
    }
  }, [gridApi, gridReady, registerScrollRef]);

  const [scrollTimeout, setScrollTimeout] = useState<NodeJS.Timeout | null>(null);

  const listClassName = useMemo(
    () => `
      ${gridReady ? 'grid' : 'list'}
      ${isScrolling ? 'scrollbar' : ''}
wrapper
bg-bg-base/20
px-0
text-text-base outline-none focus:border-none focus:outline-none
${containerClassName}
    `,
    [gridReady, isScrolling, containerClassName],
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

  // Tracks whether we've already resolved the initial index for the current prompt.
  const hasResolvedInitialIndexRef = useRef(false);
  const lastPromptKeyRef = useRef<string | null>(null);

  // Column width function for Grid - v2 API passes cellProps
  const columnWidthFn = useCallback(
    (columnIndex: number, cellProps: ChoiceGridCellProps) => {
      const index = columnIndex; // For column-based sizing
      return cellProps.choices[index]?.item?.width || cellProps.gridDimensions.columnWidth;
    },
    [],
  );

  // Row height function for Grid - v2 API passes cellProps
  const rowHeightFn = useCallback(
    (rowIndex: number, cellProps: ChoiceGridCellProps) => {
      return cellProps.gridDimensions.rowHeight;
    },
    [],
  );

  // Row height function for List - v2 API passes rowProps
  const listRowHeightFn = useCallback(
    (index: number, rowProps: ChoiceListRowProps) => {
      return rowProps.choices?.[index]?.item?.height || itemHeight;
    },
    [itemHeight],
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

  const [renderedProps, setRenderedProps] = useState<{
    visibleRowStartIndex: number;
    visibleRowStopIndex: number;
  } | null>(null);

  // v2 API: onCellsRendered callback receives visible and all cells info
  const handleCellsRendered = useCallback(
    (visibleCells: { columnStartIndex: number; columnStopIndex: number; rowStartIndex: number; rowStopIndex: number }) => {
      setRenderedProps({
        visibleRowStartIndex: visibleCells.rowStartIndex,
        visibleRowStopIndex: visibleCells.rowStopIndex,
      });
    },
    [],
  );

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

  // v2 row props for List
  const rowProps: ChoiceListRowProps = useMemo(() => ({ choices, input }), [choices, input]);

  // v2 cell props for Grid
  const cellProps: ChoiceGridCellProps = useMemo(
    () => ({
      choices,
      input,
      gridDimensions,
      cellGap: CELL_GAP,
      currentRow,
      renderedProps,
    }),
    [choices, input, gridDimensions, CELL_GAP, currentRow, renderedProps],
  );

  // Style with explicit dimensions for v2
  const listStyle: CSSProperties = useMemo(
    () => ({
      width: '100%',
      height,
    }),
    [height],
  );

  const gridStyle: CSSProperties = useMemo(
    () => ({
      width,
      height,
    }),
    [width, height],
  );

  return (
    <div id="list" style={{ width }} className="list-component flex flex-col w-full overflow-y-hidden">
      {gridReady ? (
        <Grid<ChoiceGridCellProps>
          gridRef={setGridApi}
          cellComponent={GridCellComponent}
          cellProps={cellProps}
          className={listClassName}
          style={gridStyle}
          columnCount={gridDimensions.columnCount}
          rowCount={gridDimensions.rowCount}
          columnWidth={gridDimensions.columnWidth}
          rowHeight={gridDimensions.rowHeight}
          onCellsRendered={handleCellsRendered}
          overscanCount={2}
        />
      ) : (
        <List<ChoiceListRowProps>
          listRef={setListApi}
          rowComponent={ListRowComponent}
          rowProps={rowProps}
          className={listClassName}
          style={listStyle}
          rowCount={choices?.length || 0}
          rowHeight={listRowHeightFn}
          overscanCount={2}
        />
      )}
    </div>
  );
}
