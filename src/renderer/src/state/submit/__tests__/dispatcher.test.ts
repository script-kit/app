import { describe, it, expect } from 'vitest';
import { Channel } from '@johnlindquist/kit/core/enum';
import { decideSubmit } from '../dispatcher';

describe('submit dispatcher', () => {
  it('returns ACTION when hasAction is true', () => {
    const ctx = { hasAction: true, action: { name: 'Act' }, overlayOpen: true, flag: 'flag' } as any;
    const d = decideSubmit(ctx, 'value');
    expect(d.channel).toBe(Channel.ACTION);
    expect((d as any).override.action).toEqual(ctx.action);
  });

  it('returns VALUE_SUBMITTED with flag when overlay open and no action', () => {
    const ctx = { hasAction: false, action: {}, overlayOpen: true, flag: 'flag' } as any;
    const d = decideSubmit(ctx, 'value');
    expect(d.channel).toBe(Channel.VALUE_SUBMITTED);
    expect((d as any).override).toEqual({ value: 'value', flag: 'flag' });
  });

  it('returns VALUE_SUBMITTED with flag when overlay closed and no action', () => {
    const ctx = { hasAction: false, action: {}, overlayOpen: false, flag: 'flag' } as any;
    const d = decideSubmit(ctx, 'value');
    expect(d.channel).toBe(Channel.VALUE_SUBMITTED);
    expect((d as any).override).toEqual({ value: 'value', flag: 'flag' });
  });
});

