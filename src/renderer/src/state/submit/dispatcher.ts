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
 * Assumptions:
 * - Validation (strict, scriptlet inputs, preventSubmitWithoutAction) is handled before calling this.
 * - "value" should come from the caller (focused choice value, input, term output, etc.).
 */
export function decideSubmit(ctx: SubmitContext, value: any): SubmitDecision {
  if (ctx?.hasAction) {
    return { channel: Channel.ACTION, override: { action: ctx.action } };
  }
  // Normal submission path. Include flag only when overlay is open and we have a flag.
  const flag = ctx.overlayOpen ? ctx.flag : undefined;
  return { channel: Channel.VALUE_SUBMITTED, override: { value, ...(flag ? { flag } : {}) } };
}

