import { vi } from 'vitest';

export const subs = [];

export const systemScriptChanged = vi.fn();
export const unlinkEvents = vi.fn();

export const systemEventMap = new Map();
export const validSystemEvents = ['resume', 'unlock-screen', 'suspend', 'lock-screen'];
