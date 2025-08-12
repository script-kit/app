import { describe, it, expect, vi } from 'vitest';
import { makeOnline, makeSponsorCheck } from '../src/main/state/sponsor';

const makeDeps = (overrides: any = {}) => {
  const kitState = {
    url: 'https://scriptkit.com',
    user: { login: 'foo', node_id: '123' },
    isSponsor: false,
  } as any;
  const kitStore = {
    _val: false,
    get: vi.fn(() => kitStore._val),
    set: vi.fn((_, v) => {
      kitStore._val = v;
    }),
  } as any;
  const axios = {
    post: vi.fn(),
  } as any;
  const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
  const emitter = { emit: vi.fn() } as any;
  const kitPath = (...parts: string[]) => parts.join('/');
  const Trigger = { App: 'App' } as any;
  const internetAvailable = vi.fn(async () => true);
  const online = makeOnline({ internetAvailable, log });
  return {
    axios,
    kitState,
    kitStore,
    log,
    emitter,
    events: { KitEvent: { RunPromptProcess: 'RunPromptProcess' } as any },
    kitPath,
    Trigger,
    online,
    ...overrides,
  };
};

describe('sponsorCheck', () => {
  it('uses cached sponsor flag when offline', async () => {
    const deps = makeDeps({
      online: async () => false,
    });
    deps.kitStore._val = true; // cached sponsor
    const sponsorCheck = makeSponsorCheck(deps);
    const ok = await sponsorCheck('FeatureX');
    expect(ok).toBe(true);
  });

  it('sets sponsor true when API matches node_id', async () => {
    const deps = makeDeps();
    deps.axios.post.mockResolvedValue({ status: 200, data: { id: '123' } });
    const sponsorCheck = makeSponsorCheck(deps);
    const ok = await sponsorCheck('FeatureY');
    expect(ok).toBe(true);
    expect(deps.kitState.isSponsor).toBe(true);
    expect(deps.kitStore.set).toHaveBeenCalledWith('sponsor', true);
  });

  it('emits upsell when not a sponsor and block=true', async () => {
    const deps = makeDeps();
    deps.axios.post.mockResolvedValue({ status: 200, data: { id: '999' } });
    const sponsorCheck = makeSponsorCheck(deps);
    const ok = await sponsorCheck('FeatureZ');
    expect(ok).toBe(false);
    expect(deps.emitter.emit).toHaveBeenCalled();
  });
});