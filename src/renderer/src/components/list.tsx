import { hotkeysOptions } from '@renderer/hooks/shared';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import { type CSSProperties, type ReactElement, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useHotkeys } from 'react-hotkeys-hook';
import {
  type CellComponentProps,
  Grid,
  type GridImperativeAPI,
  List,
  type ListImperativeAPI,
  type RowComponentProps,
  useGridCallbackRef,
  useListCallbackRef,
} from 'react-window';
import type { ListProps, ScoredChoice } from '../../../shared/types';
import useGridNav from '../hooks/useGridNav';
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
  // Fix: (columnCount - 1) gaps between N columns, Math.max prevents negative when columnCount=1
  const totalGapSpace = cellGap * Math.max(0, columnCount - 1);
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
  renderedProps,
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
      (rowIndex - (focusedOnLastRow ? renderedProps.visibleRowStopIndex - 1 : renderedProps.visibleRowStartIndex)) *
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

  // Unified grid navigation using the shared strategy pattern
  const nav = useGridNav({
    id: 'choices-grid',
    getCount: () => choices.length,
    getIndex: () => index,
    setIndex: (next) => setIndex(next),
    getDimensions: () => ({
      columnCount: gridDimensions.columnCount,
      rowCount: gridDimensions.rowCount,
    }),
    loop: promptData?.loop ?? false,
    pageSize: 5,
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
          listApi.scrollToRow({ index, align: (align || 'auto') as any });
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
          gridApi.scrollToCell({
            rowIndex,
            columnIndex,
            rowAlign: (align || 'auto') as any,
            columnAlign: (align || 'auto') as any,
          });
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
  const columnWidthFn = useCallback((columnIndex: number, cellProps: ChoiceGridCellProps) => {
    const index = columnIndex; // For column-based sizing
    return cellProps.choices[index]?.item?.width || cellProps.gridDimensions.columnWidth;
  }, []);

  // Row height function for Grid - v2 API passes cellProps
  const rowHeightFn = useCallback((_rowIndex: number, cellProps: ChoiceGridCellProps) => {
    return cellProps.gridDimensions.rowHeight;
  }, []);

  // Row height function for List - v2 API passes rowProps
  const listRowHeightFn = useCallback(
    (index: number, rowProps: ChoiceListRowProps) => {
      return rowProps.choices?.[index]?.item?.height || itemHeight;
    },
    [itemHeight],
  );

  // Computed values for rendering (not used in hotkey handler anymore)
  const currentColumn = index % gridDimensions.columnCount;
  const currentRow = Math.floor(index / gridDimensions.columnCount);

  // Arrow key navigation using unified grid nav strategy
  // Note: Only preventDefault for up/down (to prevent page scroll), not left/right
  // (to allow text cursor movement in input fields and path browser navigation)
  useHotkeys(
    ['up', 'down'],
    (event) => {
      if (!gridReady) return;

      event.preventDefault();
      setMouseEnabled(0);

      switch (event.key) {
        case 'ArrowUp':
          nav.moveUp();
          break;
        case 'ArrowDown':
          nav.moveDown();
          break;
      }
    },
    hotkeysOptions,
    [gridReady, nav, setMouseEnabled],
  );

  // Left/right grid navigation - in grid mode, arrows ALWAYS navigate the grid
  // (cursor movement in input is sacrificed for grid navigation UX)
  useHotkeys(
    ['left', 'right'],
    (event) => {
      if (!gridReady) return;

      // In grid mode, always navigate grid with arrow keys
      event.preventDefault();
      setMouseEnabled(0);

      switch (event.key) {
        case 'ArrowLeft':
          nav.moveLeft();
          break;
        case 'ArrowRight':
          nav.moveRight();
          break;
      }
    },
    hotkeysOptions,
    [gridReady, nav, setMouseEnabled],
  );

  // PageUp/PageDown/Home/End navigation using unified grid nav strategy
  useHotkeys(
    ['pageup', 'pagedown', 'home', 'end'],
    (event) => {
      if (!gridReady) return;

      event.preventDefault();
      setMouseEnabled(0);

      switch (event.key) {
        case 'PageUp':
          nav.pageUp();
          break;
        case 'PageDown':
          nav.pageDown();
          break;
        case 'Home':
          nav.jumpToFirst();
          break;
        case 'End':
          nav.jumpToLast();
          break;
      }
    },
    hotkeysOptions,
    [gridReady, nav, setMouseEnabled],
  );

  const [renderedProps, setRenderedProps] = useState<{
    visibleRowStartIndex: number;
    visibleRowStopIndex: number;
  } | null>(null);

  // v2 API: onCellsRendered callback receives visible and all cells info
  const handleCellsRendered = useCallback(
    (visibleCells: {
      columnStartIndex: number;
      columnStopIndex: number;
      rowStartIndex: number;
      rowStopIndex: number;
    }) => {
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
