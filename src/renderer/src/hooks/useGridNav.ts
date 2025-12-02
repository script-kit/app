import { useCallback, useEffect, useRef } from 'react';

export type GridNavReason = 'key' | 'hover' | 'click' | 'data' | 'open' | 'restore' | 'programmatic';

export type GridNavEvent =
  | { type: 'MOVE'; direction: 'up' | 'down' | 'left' | 'right'; source?: GridNavReason }
  | { type: 'PAGE'; direction: 'up' | 'down'; pageSize?: number; source?: GridNavReason }
  | { type: 'JUMP'; target: 'first' | 'last'; source?: GridNavReason }
  | { type: 'SET'; index: number; source?: GridNavReason }
  | { type: 'HOVER'; index: number }
  | { type: 'CLICK'; index: number }
  | { type: 'RESET'; source?: GridNavReason };

export type GridDimensions = {
  columnCount: number;
  rowCount: number;
};

export type GridNavConfig = {
  id: string;
  getCount: () => number;
  getIndex: () => number;
  setIndex: (next: number, reason: GridNavReason) => void;
  getDimensions: () => GridDimensions;
  loop?: boolean;
  pageSize?: number; // Default rows to jump for page up/down
};

/**
 * Calculate new index for 2D grid navigation
 */
function calculateGridMove(
  currentIndex: number,
  direction: 'up' | 'down' | 'left' | 'right',
  dimensions: GridDimensions,
  totalCount: number,
  loop: boolean,
): number {
  const { columnCount, rowCount } = dimensions;
  const col = currentIndex % columnCount;
  const row = Math.floor(currentIndex / columnCount);

  let newIndex = currentIndex;

  switch (direction) {
    case 'left':
      if (col > 0) {
        newIndex = row * columnCount + (col - 1);
      } else if (loop) {
        // Wrap to last column of same row
        const lastColInRow = Math.min(columnCount - 1, totalCount - 1 - row * columnCount);
        newIndex = row * columnCount + lastColInRow;
      }
      break;

    case 'right':
      if (col < columnCount - 1 && row * columnCount + col + 1 < totalCount) {
        newIndex = row * columnCount + (col + 1);
      } else if (loop) {
        // Wrap to first column of same row
        newIndex = row * columnCount;
      }
      break;

    case 'up':
      if (row > 0) {
        newIndex = (row - 1) * columnCount + col;
      } else if (loop) {
        // Wrap to last row, same column (if that cell exists)
        const lastRow = rowCount - 1;
        const targetIndex = lastRow * columnCount + col;
        newIndex = Math.min(targetIndex, totalCount - 1);
      }
      break;

    case 'down':
      if (row < rowCount - 1) {
        const targetIndex = (row + 1) * columnCount + col;
        if (targetIndex < totalCount) {
          newIndex = targetIndex;
        } else if (loop) {
          // Wrap to first row, same column
          newIndex = col;
        }
      } else if (loop) {
        // Wrap to first row, same column
        newIndex = col;
      }
      break;
  }

  return newIndex;
}

/**
 * Calculate new index for page navigation in grid
 */
function calculateGridPage(
  currentIndex: number,
  direction: 'up' | 'down',
  dimensions: GridDimensions,
  totalCount: number,
  pageSize: number,
): number {
  const { columnCount, rowCount } = dimensions;
  const col = currentIndex % columnCount;
  const row = Math.floor(currentIndex / columnCount);

  if (direction === 'up') {
    const jumpRows = Math.min(pageSize, row);
    return Math.max(0, (row - jumpRows) * columnCount + col);
  } else {
    const jumpRows = Math.min(pageSize, rowCount - 1 - row);
    return Math.min(totalCount - 1, (row + jumpRows) * columnCount + col);
  }
}

/**
 * Unified navigation hook for 2D grid navigation.
 * Provides consistent navigation behavior with loop support,
 * page navigation, and jump-to-boundary operations.
 */
export function useGridNav(config: GridNavConfig) {
  const { id, getCount, getIndex, setIndex, getDimensions, loop = false, pageSize = 5 } = config;

  // Use refs for stable callback
  const configRef = useRef(config);
  useEffect(() => {
    configRef.current = config;
  }, [config]);

  const dispatch = useCallback(
    (e: GridNavEvent) => {
      const { getCount, getIndex, setIndex, getDimensions, loop = false, pageSize = 5 } = configRef.current;
      const count = getCount();
      const current = getIndex();
      const dims = getDimensions();

      if (count <= 0) return;

      switch (e.type) {
        case 'MOVE': {
          const next = calculateGridMove(current, e.direction, dims, count, loop);
          if (next !== current) setIndex(next, e.source ?? 'key');
          break;
        }
        case 'PAGE': {
          const size = e.pageSize ?? pageSize;
          const next = calculateGridPage(current, e.direction, dims, count, size);
          if (next !== current) setIndex(next, e.source ?? 'key');
          break;
        }
        case 'JUMP': {
          const next = e.target === 'first' ? 0 : count - 1;
          if (next !== current) setIndex(next, e.source ?? 'key');
          break;
        }
        case 'SET': {
          const i = e.index;
          if (i >= 0 && i < count && i !== current) setIndex(i, e.source ?? 'programmatic');
          break;
        }
        case 'HOVER': {
          if (e.index >= 0 && e.index < count && e.index !== current) setIndex(e.index, 'hover');
          break;
        }
        case 'CLICK': {
          if (e.index >= 0 && e.index < count && e.index !== current) setIndex(e.index, 'click');
          break;
        }
        case 'RESET': {
          if (current !== 0 && count > 0) setIndex(0, e.source ?? 'programmatic');
          break;
        }
        default: {
          if ((window as any).DEBUG_GRIDNAV) {
            console.warn(`GridNav(${id}): unhandled event`, e);
          }
        }
      }

      if ((window as any).DEBUG_GRIDNAV) {
        const after = getIndex();
        console.log(`GridNav(${id}): index ${current} -> ${after}`, e);
      }
    },
    [id],
  );

  // Convenience methods
  const moveUp = useCallback(() => dispatch({ type: 'MOVE', direction: 'up', source: 'key' }), [dispatch]);
  const moveDown = useCallback(() => dispatch({ type: 'MOVE', direction: 'down', source: 'key' }), [dispatch]);
  const moveLeft = useCallback(() => dispatch({ type: 'MOVE', direction: 'left', source: 'key' }), [dispatch]);
  const moveRight = useCallback(() => dispatch({ type: 'MOVE', direction: 'right', source: 'key' }), [dispatch]);
  const pageUp = useCallback(
    (size?: number) => dispatch({ type: 'PAGE', direction: 'up', pageSize: size, source: 'key' }),
    [dispatch],
  );
  const pageDown = useCallback(
    (size?: number) => dispatch({ type: 'PAGE', direction: 'down', pageSize: size, source: 'key' }),
    [dispatch],
  );
  const jumpToFirst = useCallback(() => dispatch({ type: 'JUMP', target: 'first', source: 'key' }), [dispatch]);
  const jumpToLast = useCallback(() => dispatch({ type: 'JUMP', target: 'last', source: 'key' }), [dispatch]);

  return {
    dispatch,
    moveUp,
    moveDown,
    moveLeft,
    moveRight,
    pageUp,
    pageDown,
    jumpToFirst,
    jumpToLast,
  };
}

export default useGridNav;
