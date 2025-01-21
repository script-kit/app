import { vi } from 'vitest';

export class Processes {
  startHeartbeat = vi.fn();
  stopHeartbeat = vi.fn();
}

export const processes = new Processes();

export const clearIdleProcesses = vi.fn();
export const ensureIdleProcess = vi.fn();
export const sendToAllActiveChildren = vi.fn();
export const spawnShebang = vi.fn();
export const updateTheme = vi.fn();
