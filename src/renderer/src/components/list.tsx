import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { VariableSizeList as List, VariableSizeGrid as Grid, type GridOnItemsRenderedProps } from 'react-window';
import type { ChoiceButtonProps, ListProps } from '../../../shared/types';
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
  requiresScrollAtom,
  scoredChoicesAtom,
} from "../state";
import ChoiceButton from './button';
import { createLogger } from '../log-utils';
import { useHotkeys } from 'react-hotkeys-hook';
import { hotkeysOptions } from '@renderer/hooks/shared';
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

let previousIndex = 0;
export default function ChoiceList({ width, height }: ListProps) {
  const listRef = useRef<null | List>(null);
  const [choices] = useAtom(scoredChoicesAtom);
  const [index, setIndex] = useAtom(indexAtom);
  const itemHeight = useAtomValue(itemHeightAtom);
  const promptData = useAtomValue(promptDataAtom);
  const [list, setList] = useAtom(listAtom);
  const [requiresScroll, setRequiresScroll] = useAtom(requiresScrollAtom);
  const [isScrolling, setIsScrolling] = useAtom(isScrollingAtom);
  const setMouseEnabled = useSetAtom(mouseEnabledAtom);
  const gridReady = useAtomValue(gridReadyAtom);
  const containerClassName = useAtomValue(containerClassNameAtom);

  const handleListRef = useCallback(
    (node) => {
      if (node) {
        setList(node);
        listRef.current = node;
      }
    },
    [setList],
  );

  useEffect(() => {
    if (!listRef?.current || promptData?.grid) return;

    const scroll = () => {
      if (requiresScroll === -1) return;

      setIndex(requiresScroll);
      log.verbose(`📜 Scrolling to ${requiresScroll}`);

      if (listRef.current) {
        listRef.current.scrollToItem(requiresScroll, requiresScroll > 0 ? 'auto' : 'start');
      }
    };

    scroll();
    requestAnimationFrame(() => {
      if (listRef?.current) {
        scroll();
        setRequiresScroll(-1);
      }
    });
  }, [requiresScroll, choices.length, setIndex, setRequiresScroll, promptData?.grid]);

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

  const gridRef = useRef<Grid>(null);

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

  if (gridReady && gridRef?.current && index !== previousIndex) {
    gridRef.current.scrollToItem({
      align: 'auto',
      columnIndex: currentColumn,
      rowIndex: currentRow,
    });
  }

  previousIndex = index;

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
        setIndex(newIndex);
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
      setIndex,
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
