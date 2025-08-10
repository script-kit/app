import { computeResize, type ComputeResizeInput, type ComputeResizeOutput } from '../resize/compute';
import { PROMPT } from '@johnlindquist/kit/core/enum';

export type ResizeResult = ComputeResizeOutput;

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
  };
  
  return computeResize(computeInput);
}