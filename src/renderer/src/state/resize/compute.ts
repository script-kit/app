import { Mode, UI } from '@johnlindquist/kit/core/enum';
import type { ResizeData } from '../../../shared/types';

export type ComputeResizeInput = {
  ui: UI;
  scoredChoicesLength: number;
  choicesHeight: number;
  hasPanel: boolean;
  hasPreview: boolean;
  promptData: any;
  topHeight: number;
  footerHeight: number;
  isWindow: boolean;
  justOpened: boolean;
  flaggedValue: any;
  mainHeightCurrent: number;
  itemHeight: number;
  logVisible: boolean;
  logHeight: number;
  gridActive: boolean;
  prevMainHeight: number;
  placeholderOnly: boolean;
  panelHeight: number;
};

export type ComputeResizeOutput = {
  mainHeight: number;
  forceHeight?: number;
  forceResize: boolean;
};

// Pure calculation extracted from the DOM-effectful resize. No document or ipc usage here.
export function computeResize(i: ComputeResizeInput): ComputeResizeOutput {
  let mh = i.mainHeightCurrent;
  let forceResize = false;
  let forceHeight: number | undefined;

  if (i.ui === UI.arg) {
    if (i.promptData?.height && i.promptData.height > i.promptData?.baseHeight) {
      // If a custom height is provided above base, compute mainHeight from it
      const base = i.promptData.height;
      mh = base - i.topHeight - i.footerHeight;
    } else {
      mh = i.choicesHeight;
    }
  } else if (i.ui === UI.div) {
    // UI.div uses panel height as the main content area
    if (i.panelHeight > 0) {
      mh = i.promptData?.height || i.panelHeight;
      forceResize = true;
    } else {
      // No panel content yet, skip resize
      return { mainHeight: 0, forceHeight: undefined, forceResize: false };
    }
  }

  if (mh === 0 && i.hasPanel) {
    mh = Math.max(i.itemHeight, i.mainHeightCurrent);
  }

  if (i.hasPreview && mh < (i.promptData?.baseHeight || 0)) {
    mh = Math.max(i.choicesHeight, i.promptData?.height || i.promptData?.baseHeight || mh);
    forceResize = true;
  }

  if (i.logVisible) {
    mh += i.logHeight || 0;
  }

  if (i.ui !== UI.arg) {
    if (i.flaggedValue) {
      forceHeight = Math.max(i.promptData?.height || 0, i.promptData?.baseHeight || 0) || undefined;
    } else {
      forceHeight = i.promptData?.height;
    }
  }

  if (i.ui === UI.arg && i.flaggedValue) {
    forceHeight = i.promptData?.baseHeight || undefined;
  }

  return {
    mainHeight: mh,
    forceHeight,
    forceResize,
  };
}
