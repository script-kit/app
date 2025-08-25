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
  const debugBase = {
    hasAction: Boolean(ctx?.hasAction),
    overlayOpen: Boolean(ctx?.overlayOpen),
    hasFlag: Boolean(ctx?.flag),
    flag: ctx?.flag,
  };

  if (ctx?.hasAction) {
    const result: SubmitDecision = { channel: Channel.ACTION, override: { action: ctx.action } };
    // eslint-disable-next-line no-console
    console.log('[dispatcher.decideSubmit] ACTION path', { ...debugBase, result });
    return result;
  }

  // Normal submission path. IMPORTANT: Always include flag when present,
  // even if the overlay is not open (supports keyboard shortcuts outside overlay).
  const flag = ctx.flag;
  const result: SubmitDecision = { channel: Channel.VALUE_SUBMITTED, override: { value, ...(flag ? { flag } : {}) } };
  // eslint-disable-next-line no-console
  console.log('[dispatcher.decideSubmit] VALUE_SUBMITTED path', { ...debugBase, result });
  return result;
}
