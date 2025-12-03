import { PROMPT } from '@johnlindquist/kit/core/enum';
import { type ComputeResizeInput, type ComputeResizeOutput, computeResize } from '../resize/compute';

export type ResizeResult = ComputeResizeOutput & {
  urgentShrink: boolean;
};

/**
 * Pure service function that performs resize calculations.
 * No atom dependencies, no side-effects, just computation.
 */
export function performResize(input: any): ResizeResult {
  // Transform the input from resizeInputsAtom to match ComputeResizeInput
  const computeInput: ComputeResizeInput = {
    ui: input.ui,
    scoredChoicesLength: input.scoredChoicesLength,
    choicesHeight: input.choicesHeight,
    hasPanel: input.hasPanel,
    hasPreview: input.hasPreview,
    promptData: {
      height: input.promptData?.height,
      baseHeight: PROMPT.HEIGHT.BASE,
      preventCollapse: input.promptData?.preventCollapse,
    },
    topHeight: input.topHeight,
    footerHeight: input.footerHeight,
    isWindow: input.isWindow,
    justOpened: Boolean(input.justOpened),
    flaggedValue: input.flaggedValue,
    mainHeightCurrent: input.mainHeightCurrent,
    itemHeight: input.itemHeight,
    logVisible: input.logVisible,
    logHeight: input.logHeight,
    gridActive: input.gridActive,
    prevMainHeight: input.prevMainHeight,
    placeholderOnly: input.placeholderOnly,
    panelHeight: input.panelHeight,
  };

  const base = computeResize(computeInput);

  let mainHeight = base.mainHeight;
  const forceHeight = base.forceHeight;
  let forceResize = base.forceResize;

  // Enforce minimum height when overlay is open
  if (input.overlayOpen) {
    const baseHeight =
      input.promptData?.height && input.promptData.height > PROMPT.HEIGHT.BASE
        ? (input.promptData.height as number)
        : PROMPT.HEIGHT.BASE;
    const minMain = Math.max(0, baseHeight - input.topHeight - input.footerHeight);
    if (mainHeight < minMain) {
      mainHeight = minMain;
      forceResize = true;
    }
  }

  // Prevent collapse when script opts out
  if (mainHeight === 0 && input.promptData?.preventCollapse) {
    const fallbackMain = Math.max(
      input.mainHeightCurrent || 0,
      Math.max(0, (input.promptData?.height ?? PROMPT.HEIGHT.BASE) - input.topHeight - input.footerHeight),
    );
    mainHeight = fallbackMain;
    forceResize = true;
  }

  const urgentShrink =
    input.prevMainHeight > 0 && mainHeight > 0 && mainHeight < input.prevMainHeight && !input.placeholderOnly;

  return {
    mainHeight,
    forceHeight,
    forceResize,
    urgentShrink,
  };
}
