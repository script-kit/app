import type { Mode, UI } from '@johnlindquist/kit/core/enum';
import type { Choice } from '@johnlindquist/kit/types/core';

export interface ScoredChoice {
  item: Choice<{ id: string; name: string; value: any }>;
  score: number;
  matches: {
    [key: string]: [number, number][];
  };
  _: string;
  originalIndex?: number;
  isSequentialMatch?: boolean;
  /** Frecency multiplier applied to score (1.0 = no boost, higher = more frequent/recent) */
  frecencyBoost?: number;
}

export interface ChoiceButtonData {
  choices: ScoredChoice[];
}

// Legacy v1 props (for compatibility during migration)
export interface ChoiceButtonPropsV1 {
  data: ChoiceButtonData;
  index: number;
  style: any;
}

// v2 react-window props for List rowComponent
export interface ChoiceButtonProps {
  choices: ScoredChoice[];
  index: number;
  style: React.CSSProperties;
  input: string;
  ariaAttributes: {
    'aria-posinset': number;
    'aria-setsize': number;
    role: 'listitem';
  };
}

// v2 react-window props for Grid cellComponent
export interface GridCellProps {
  choices: ScoredChoice[];
  columnIndex: number;
  rowIndex: number;
  style: React.CSSProperties;
  ariaAttributes: {
    'aria-colindex': number;
    role: 'gridcell';
  };
  // Additional props for grid calculations
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
export interface ListProps {
  width: number;
  height: number;
}

export interface ResizeData {
  id: string;
  pid: number;
  reason: string;
  scriptPath: string;
  ui: UI;
  mode: Mode;
  topHeight: number;
  mainHeight: number;
  footerHeight: number;
  hasPanel: boolean;
  hasInput: boolean;
  open: boolean;
  previewEnabled: boolean;
  tabIndex: number;
  isSplash: boolean;
  hasPreview: boolean;
  inputChanged: boolean;
  placeholderOnly: boolean;
  forceResize: boolean;
  forceHeight?: number;
  forceWidth?: number;
  justOpened: boolean;
  totalChoices: number;
  isMainScript: boolean;
  isWindow: boolean;
}

export interface Survey {
  email: string;
  question: string;
  response: string;
  subscribe: boolean;
  contact: boolean;
}

export type TermConfig = {
  promptId: string;
  command: string;
  cwd: string;
  env: { [key: string]: string };
  shell: string | boolean;
  args?: string[];
  closeOnExit?: boolean;
  pid?: number;
  cleanPath?: boolean;
};

export interface SnippetInfo {
  filePath: string;
  postfix: boolean;
  txt: boolean;
}
