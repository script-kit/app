import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import memoize from 'memoize-one';
import { useEffect, useRef, useState, useCallback } from 'react';
import { VariableSizeList as List, VariableSizeGrid as Grid } from 'react-window';
import type { ChoiceButtonProps, ListProps } from '../../../shared/types';
import {
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
} from '../jotai';
import ChoiceButton from './button';
import { createLogger } from '../../../shared/log-utils';
import { useHotkeys } from 'react-hotkeys-hook';
import { hotkeysOptions } from '@renderer/hooks/shared';
const log = createLogger('List.tsx');

const createItemData = memoize(
  (choices) =>
    ({
      choices,
    }) as ChoiceButtonProps['data'],
);

export default function ChoiceList({ width, height }: ListProps) {
  const listRef = useRef<null | List>(null);
  // TODO: In case items ever have dynamic height
  const [choices] = useAtom(scoredChoicesAtom);
  const [index, setIndex] = useAtom(indexAtom);
  // const [inputValue] = useAtom(inputAtom);
  // const [mainHeight, setMainHeight] = useAtom(mainHeightAtom);
  const itemHeight = useAtomValue(itemHeightAtom);
  const promptData = useAtomValue(promptDataAtom);
  const [list, setList] = useAtom(listAtom);
  const [requiresScroll, setRequiresScroll] = useAtom(requiresScrollAtom);
  const [isScrolling, setIsScrolling] = useAtom(isScrollingAtom);
  const setMouseEnabled = useSetAtom(mouseEnabledAtom);
  const setDirection = useSetAtom(directionAtom);
  const gridReady = useAtomValue(gridReadyAtom);

  useEffect(() => {
    if (listRef?.current) {
      setList(listRef.current);
    }
  }, [setList]);

  useEffect(() => {
    if (!listRef?.current) {
      return;
    }

    if (promptData?.grid) {
      return;
    }

    const scroll = () => {
      if (requiresScroll === -1) {
        return;
      }
      setIndex(requiresScroll);
      log.verbose(`📜 Scrolling to ${requiresScroll}`);

      if (listRef.current) {
        listRef.current.scrollToItem(
          requiresScroll,
          // eslint-disable-next-line no-nested-ternary
          requiresScroll > 0 ? 'auto' : 'start',
        );
      }
    };

    scroll();
    setTimeout(() => {
      if (listRef?.current) {
        scroll();
        setRequiresScroll(-1);
      }
    }, 100);
  }, [requiresScroll, choices]);

  useEffect(() => {
    if (!listRef?.current) {
      return;
    }

    // log.info(`🧾 List reset due to choice height changes`);

    if (typeof listRef?.current?.resetAfterIndex === 'function') listRef?.current?.resetAfterIndex(0);
  }, [choices, promptData]);

  const [scrollTimeout, setScrollTimeout] = useState<any>(null);

  // const choicesHeight = choices.reduce((acc, choice) => {
  //   return acc + (choice?.item?.height || itemHeight);
  // }, 0);

  const itemData = createItemData(choices);

  const commonProps = {
    width,
    height,
    itemData: itemData,
    className: `
${gridReady ? 'grid' : 'list'}
      ${isScrolling ? 'scrollbar' : ''}
      wrapper
      bg-opacity-20
      px-0
      text-text-base outline-none focus:border-none focus:outline-none
    `,
  };

  const [gridDimensions, setGridDimensions] = useState({
    minColumnWidth: promptData?.columnWidth || 100,
    columnCount: promptData?.columns || 0,
    rowCount: promptData?.rowCount || 0,
    columnWidth: promptData?.columnWidth || 0,
    rowHeight: promptData?.rowHeight || promptData?.columnWidth || 100,
  });

  useEffect(() => {
    const { minColumnWidth } = gridDimensions;
    const newColumnCount =
      promptData?.columns ||
      (promptData?.columnWidth
        ? Math.min(choices.length, Math.floor(width / promptData.columnWidth))
        : Math.min(choices.length, Math.floor(width / minColumnWidth)));
    const newColumnWidth = promptData.columnWidth || width / newColumnCount;
    const newRowHeight = promptData.rowHeight || promptData.columnWidth || newColumnWidth;

    setGridDimensions((prev) => {
      const dimensions = {
        ...prev,
        columnCount: newColumnCount,
        rowCount: Math.ceil(choices.length / newColumnCount),
        columnWidth: choices.length > newColumnCount ? newColumnWidth : prev.columnWidth,
        rowHeight: choices.length > newColumnCount ? newRowHeight : prev.rowHeight,
      };

      log.info(`🛟 Grid dimensions:`, dimensions);

      gridRef?.current?.resetAfterIndices({
        columnIndex: 0,
        rowIndex: 0,
      });

      return dimensions;
    });
  }, [choices.length, width, gridDimensions.minColumnWidth, promptData.columnWidth, promptData.rowHeight]);

  const [choicesChanged, setChoicesChanged] = useState(false);

  const gridRef = useRef<Grid>(null);
  useEffect(() => {
    if (gridRef?.current) {
      log.info(`🛟 Grid reset: resetAfterIndices`);
      gridRef?.current?.resetAfterIndices({
        columnIndex: 0,
        rowIndex: 0,
        shouldForceUpdate: true,
      });
    }
  }, [choices, gridRef?.current, promptData.columnWidth, promptData.rowHeight]);

  useEffect(() => {
    if (choicesChanged) {
      // Reset the state after handling the change
      setChoicesChanged(false);
    }
  }, [choicesChanged]);

  const columnWidthCallback = useCallback(
    (index: number) => {
      const width = choices[index]?.item?.width || gridDimensions.columnWidth;

      return width;
    },
    [choices, gridDimensions.columnWidth, promptData?.grid],
  );

  const rowHeightCallback = useCallback(
    (index: number) => {
      return choices[index]?.item?.height || gridDimensions.rowHeight;
    },
    [choices, gridDimensions.rowHeight, promptData?.grid],
  );

  const [currentColumn, setCurrentColumn] = useState(0);
  const [currentRow, setCurrentRow] = useState(0);

  useEffect(() => {
    if (gridReady) {
      const column = index % gridDimensions.columnCount;
      const row = Math.floor(index / gridDimensions.columnCount);
      setCurrentColumn(column);
      setCurrentRow(row);

      log.info(`🔥 Grid position -> col: ${column} row: ${row} =  index: ${index}`);
    }
    // log.info(`😩 Scrolling to ${column}, ${row}`,{column, row})
    //   gridRef?.current?.scrollToItem({
    //     columnIndex: column,
    //     rowIndex: row,
    //     align: 'auto'
    //   })
    // }
  }, [index, gridDimensions.columnCount, gridReady]);

  /*
There's a lot of overlap between this useHotKeys and what's going on in useKeyIndex.
This one does up, down, left, and right, whereas useKeyIndex only does up and down.
But it's probably worth investigating in the future to see if I can combine the way that list and grid index behavior works into one hook or something.
*/
  useHotkeys(
    ['up', 'down', 'left', 'right'],
    (event) => {
      if (!gridReady) {
        return;
      }
      /*
This can be a fun bug where it looks like you can't see the mouse cursor, but it's still detected and conflicting with the current index.
So even though you're pressing left, right, up, and down arrow keys on the keyboard,
there's a phantom mouse also conflicting with setting the index. So you have to disable the mouse here.
*/
      setMouseEnabled(0);
      let newIndex = index;

      switch (event.key) {
        case 'ArrowLeft':
          if (currentColumn > 0) {
            setDirection(-1);
            newIndex = currentRow * gridDimensions.columnCount + (currentColumn - 1);
          }
          break;
        case 'ArrowRight':
          if (currentColumn < gridDimensions.columnCount - 1) {
            setDirection(1);
            newIndex = Math.min(currentRow * gridDimensions.columnCount + (currentColumn + 1), choices.length - 1);
          }
          break;
        case 'ArrowUp':
          if (currentRow > 0) {
            setDirection(-1);
            newIndex = (currentRow - 1) * gridDimensions.columnCount + currentColumn;
          }
          break;
        case 'ArrowDown':
          if (currentRow < gridDimensions.rowCount - 1) {
            setDirection(1);
            newIndex = Math.min(choices.length - 1, (currentRow + 1) * gridDimensions.columnCount + currentColumn);
          }
          break;
      }

      if (newIndex !== index) {
        setIndex(newIndex);
      }
    },
    hotkeysOptions,
    [currentColumn, currentRow, gridDimensions.columnCount, gridDimensions.rowCount, gridReady, choices.length, index],
  );

  return (
    <div id="list" style={{ width }} className="list-component flex flex-col w-full overflow-y-hidden">
      {gridReady ? (
        <Grid
          {...commonProps}
          ref={gridRef}
          overscanRowCount={2}
          columnCount={gridDimensions.columnCount}
          rowCount={gridDimensions.rowCount}
          columnWidth={columnWidthCallback}
          rowHeight={rowHeightCallback}
          width={width}
        >
          {({ columnIndex, rowIndex, style, data }) => {
            const index = rowIndex * gridDimensions.columnCount + columnIndex;
            // biome-ignore lint/style/useBlockStatements: <explanation>
            if (index >= choices.length) return null;
            return <ChoiceButton index={index} style={style} data={data} />;
          }}
        </Grid>
      ) : (
        <List
          {...commonProps}
          ref={listRef}
          overscanCount={2}
          itemCount={choices?.length || 0}
          itemSize={(i) => {
            const maybeHeight = choices?.[i]?.item?.height;
            return typeof maybeHeight === 'number' ? maybeHeight : itemHeight;
          }}
          onScroll={(props) => {
            if (index === 0 || index === 1) {
              setIsScrolling(false);
            } else {
              setIsScrolling(true);
            }

            // TODO: Disable scrolling if onScroll hasn't trigger for 250ms
            // clear the previous timeout
            if (scrollTimeout) {
              clearTimeout(scrollTimeout);
            }

            // set a new timeout
            setScrollTimeout(
              setTimeout(() => {
                setIsScrolling(false);
              }, 250),
            );
          }}
          itemKey={(i, data) => {
            const id = data?.choices?.[i]?.item?.id;
            return id || i;
          }}
          width="100%"
        >
          {ChoiceButton}
        </List>
      )}
    </div>
  );
}
