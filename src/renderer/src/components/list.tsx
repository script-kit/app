import { useAtom, useAtomValue } from 'jotai';
import memoize from 'memoize-one';
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { VariableSizeList as List, VariableSizeGrid as Grid } from 'react-window';
import type { ChoiceButtonProps, ListProps } from '../../../shared/types';
import {
  currentChoiceHeightsAtom,
  flaggedChoiceValueAtom,
  gridReadyAtom,
  indexAtom,
  isScrollingAtom,
  itemHeightAtom,
  listAtom,
  promptDataAtom,
  requiresScrollAtom,
  scoredChoicesAtom,
} from '../jotai';
import ChoiceButton from './button';
import {createLogger} from "../../../shared/log-utils"
import { useHotkeys } from 'react-hotkeys-hook';
import { hotkeysOptions } from '@renderer/hooks/shared';
const log = createLogger("List.tsx")

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
  const flagValue = useAtomValue(flaggedChoiceValueAtom);

  const currentChoiceHeights = useAtomValue(currentChoiceHeightsAtom);
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

    if(promptData?.grid){
      return
    }

    const scroll = () => {
      if (requiresScroll === -1) {
        return;
      }
      setIndex(requiresScroll);
      log.verbose(`📜 Scrolling to ${requiresScroll}`);

      if(listRef.current) {
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
    overscanCount: 2,
    width,
    height,
    itemData: itemData,
    className: `
      ${isScrolling ? 'scrollbar' : ''}
      wrapper
      bg-opacity-20
      px-0
      text-text-base outline-none focus:border-none focus:outline-none
    `,
  };

  const [gridDimensions, setGridDimensions] = useState({
    minColumnWidth: promptData?.columnWidth || 100,
    columnCount: 0,
    rowCount: 0,
    columnWidth: 0,
    rowHeight: promptData?.rowHeight || promptData?.columnWidth || 100
  });

  useEffect(() => {
    const { minColumnWidth } = gridDimensions;
    const newColumnCount = promptData.columnWidth ? Math.min(choices.length, Math.floor(width / promptData.columnWidth)) : Math.min(choices.length, Math.floor(width / minColumnWidth));
    const newColumnWidth = promptData.columnWidth || width / newColumnCount
    const newRowHeight = promptData.rowHeight || promptData.columnWidth || newColumnWidth;

    log.info({newRowHeight})

    setGridDimensions(prev => {
      log.info({prev, length: choices.length, newColumnCount, newColumnWidth, newRowHeight})
      return ({
        ...prev,
        columnCount: newColumnCount,
        rowCount: Math.ceil(choices.length / newColumnCount),
        columnWidth: choices.length > newColumnCount ? newColumnWidth : prev.columnWidth,
        rowHeight: choices.length > newColumnCount ? newRowHeight : prev.rowHeight
      })
    });
  }, [choices.length, width, gridDimensions.minColumnWidth, promptData.columnWidth, promptData.rowHeight]);

  const [choicesChanged, setChoicesChanged] = useState(false);

  const gridRef = useRef<Grid>(null);
  useEffect(() => {
    log.info(`PromptData columnWidth: ${promptData.columnWidth} rowHeight: ${promptData.rowHeight}`)
    if(gridRef?.current) {
      gridRef?.current?.resetAfterIndices({
        columnIndex: 0,
        rowIndex: 0,
        shouldForceUpdate: true
      })
    }
  }, [choices, gridRef?.current, promptData.columnWidth, promptData.rowHeight]);


  useEffect(() => {
    if (choicesChanged) {
      // Reset the state after handling the change
      setChoicesChanged(false);
    }
  }, [choicesChanged]);

  const columnWidthCallback = useCallback((index: number) => {
    const width = choices[index]?.item?.width || gridDimensions.columnWidth;

    return width;
  }, [choices, gridDimensions.columnWidth, promptData?.grid]);

  const rowHeightCallback = useCallback((index: number) => {
    return choices[index]?.item?.height || gridDimensions.rowHeight;
  }, [choices, gridDimensions.rowHeight, promptData?.grid]);

  const [currentColumn, setCurrentColumn] = useState(0);

  useEffect(() => {
    if (gridReady) {
      setCurrentColumn(index % gridDimensions.columnCount);
    }
  }, [index, gridDimensions.columnCount, gridReady]);

  useHotkeys('left', () => {
    if (gridReady && currentColumn > 0) {
      const newColumn = currentColumn - 1;
      const newIndex = Math.floor(index / gridDimensions.columnCount) * gridDimensions.columnCount + newColumn;
      if (newIndex !== index) {
        setIndex(newIndex);
      }
    }
  }, hotkeysOptions, [currentColumn, gridDimensions.columnCount, index, gridReady]);

  useHotkeys('right', () => {
    if (gridReady && currentColumn < gridDimensions.columnCount - 1) {
      const newColumn = currentColumn + 1;
      const newIndex = Math.min(Math.floor(index / gridDimensions.columnCount) * gridDimensions.columnCount + newColumn, choices.length - 1);
      if (newIndex !== index) {
        setIndex(newIndex);
      }
    }
  }, hotkeysOptions, [currentColumn, gridDimensions.columnCount, index, gridReady, choices.length]);

  useHotkeys('up', () => {
    if (gridReady && index >= gridDimensions.columnCount) {
      const newIndex = Math.max(0, index - gridDimensions.columnCount);
      if (newIndex !== index) {
        setIndex(newIndex);
      }
    }
  }, hotkeysOptions, [gridDimensions.columnCount, index, gridReady]);

  useHotkeys('down', () => {
    if (gridReady && index < choices.length - gridDimensions.columnCount) {
      const newIndex = Math.min(choices.length - 1, index + gridDimensions.columnCount);
      if (newIndex !== index) {
        setIndex(newIndex);
      }
    }
  }, hotkeysOptions, [gridDimensions.columnCount, index, gridReady, choices.length]);

  return (
    <div id="list" style={{ width }} className="list-component flex flex-col w-full overflow-y-hidden">
      {gridReady ? (
        <Grid
          {...commonProps}
          ref={gridRef}

          columnCount={gridDimensions.columnCount}
          rowCount={gridDimensions.rowCount}
          columnWidth={columnWidthCallback}
          rowHeight={rowHeightCallback}
          width={width}

        >
          {({ columnIndex, rowIndex, style, data }) => {
            const index = rowIndex * gridDimensions.columnCount + columnIndex;
            if (index >= choices.length) return null;
            return (
              <ChoiceButton index={index} style={style} data={data} />
            );
          }}
        </Grid>
      ) : (
        <List
          {...commonProps}

          ref={listRef}
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
