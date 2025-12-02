import { Channel } from '@johnlindquist/kit/core/enum';

export type SubmitDecision =
  | { channel: Channel.ACTION; override: { action: any } }
  | { channel: Channel.VALUE_SUBMITTED; override: { value: any; flag?: string } };

export type SubmitContext = {
  hasAction: boolean;
  action: any;
  overlayOpen: boolean;
  flag?: string;
};

/**
 * Decide whether to submit an ACTION or a VALUE_SUBMITTED payload.
 * This keeps jotai.ts simpler by isolating the branching logic.
 *
 * Decision flow:
 * 1. If `hasAction` is true → Channel.ACTION (triggers onAction handler in script)
 * 2. Otherwise → Channel.VALUE_SUBMITTED with optional flag parameter
 *
 * The flag is included when present, even if the overlay is closed.
 * This supports keyboard shortcuts that trigger flags without opening the overlay.
 *
 * Assumptions:
 * - Validation (strict, scriptlet inputs, preventSubmitWithoutAction) is handled before calling this.
 * - "value" should come from the caller (focused choice value, input, term output, etc.).
 *
 * @param ctx - The submission context containing action, flag, and overlay state
 * @param value - The value to submit (choice value, input, etc.)
 * @returns A decision object with channel and override payload
 */
export function decideSubmit(ctx: SubmitContext, value: any): SubmitDecision {
  if (ctx?.hasAction) {
    return { channel: Channel.ACTION, override: { action: ctx.action } };
  }

  // Normal submission path. IMPORTANT: Always include flag when present,
  // even if the overlay is not open (supports keyboard shortcuts outside overlay).
  const flag = ctx.flag;
  return { channel: Channel.VALUE_SUBMITTED, override: { value, ...(flag ? { flag } : {}) } };
}
