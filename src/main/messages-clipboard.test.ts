import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => {
  let _text = 'INITIAL';
  let _html = '';
  let _rtf = '';
  const clipboard = {
    readText: vi.fn(() => _text),
    writeText: vi.fn((t: string) => {
      _text = t ?? '';
    }),
    readHTML: vi.fn(() => _html),
    writeHTML: vi.fn((h: string) => {
      _html = h ?? '';
    }),
    readRTF: vi.fn(() => _rtf),
    writeRTF: vi.fn((r: string) => {
      _rtf = r ?? '';
    }),
    availableFormats: vi.fn(() => [] as string[]),
  } as any;

  const app = {
    dock: { isVisible: vi.fn(() => false), hide: vi.fn() },
  } as any;

  return { clipboard, app, BrowserWindow: { fromId: vi.fn() } };
});

const sent: any[] = [];
vi.mock('./channel', () => ({
  createSendToChild: vi.fn(() => (data: any) => sent.push(data)),
  sendToAllPrompts: vi.fn(),
}));

// Provide robotjs shim
const keyTap = vi.fn();
const typeString = vi.fn();
vi.mock('./shims', () => ({
  default: {
    '@jitsi/robotjs': { keyTap, typeString },
  },
  supportsDependency: vi.fn(() => true),
  target: 'test',
}));

// Mock processes.getByPid to return our process info
const processInfo: any = {
  pid: 123,
  prompt: {
    id: 'p1',
    sendToPrompt: vi.fn(),
    window: { webContents: { ipc: { once: vi.fn() } } },
    focusPrompt: vi.fn(),
    getPromptBounds: vi.fn(() => ({ x: 0, y: 0, width: 0, height: 0 })),
  },
  child: {},
};
vi.mock('./process', () => ({
  processes: {
    getByPid: vi.fn(() => processInfo),
  },
}));

// Mock state (lots of imports in messages.ts)
const kitState: any = {
  supportsNut: true,
  isMac: false,
  kenvEnv: {},
};
vi.mock('./state', () => ({
  kitState,
  kitStore: { get: vi.fn(), set: vi.fn() },
  kitConfig: {},
  kitCache: {
    choices: [],
    keys: [],
    triggers: new Map(),
    postfixes: new Map(),
    keywords: new Map(),
    shortcodes: new Map(),
  },
  preloadChoicesMap: new Map(),
  sponsorCheck: vi.fn(async () => true),
  getSchedule: vi.fn(() => []),
  getBackgroundTasks: vi.fn(() => []),
  online: vi.fn(async () => true),
  scheduleMap: new Map(),
  subs: [],
}));

// Minimal logs
vi.mock('./logs', () => ({
  getLog: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
  consoleLog: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  promptLog: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), verbose: vi.fn(), silly: vi.fn() },
  searchLog: { info: vi.fn(), silly: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { Channel } from '@johnlindquist/kit/core/enum';
import { clipboard } from 'electron';
import { createMessageMap } from './messages';

describe('Clipboard handlers', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    sent.length = 0;
    keyTap.mockClear();
    typeString.mockClear();
    (clipboard.readText as any).mockClear();
    (clipboard.writeText as any).mockClear();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('SET_SELECTED_TEXT restores previous clipboard when unchanged', async () => {
    // Arrange
    kitState.isMac = false;
    (clipboard.writeText as any).mockImplementation((t: string) => {
      // emulate write
      (clipboard.readText as any).mockReturnValue(t);
    });
    (clipboard.readText as any).mockReturnValue('prev');

    const map = createMessageMap(processInfo as any);
    // Act
    map[Channel.SET_SELECTED_TEXT]({
      channel: Channel.SET_SELECTED_TEXT,
      pid: processInfo.pid,
      value: { text: 'new', hide: false },
    } as any);

    vi.advanceTimersByTime(10); // paste wait
    vi.advanceTimersByTime(300); // restore delay

    // Assert: first write to 'new', then restored to 'prev'
    expect((clipboard.writeText as any).mock.calls[0][0]).toBe('new');
    // The last writeText call should restore 'prev'
    const last = (clipboard.writeText as any).mock.calls.pop()?.[0];
    expect(last).toBe('prev');
    // ACK sent to child
    expect(sent.find((d) => d.channel === Channel.SET_SELECTED_TEXT)).toBeTruthy();
  });

  it('SET_SELECTED_TEXT skips restore when clipboard changed by user', async () => {
    kitState.isMac = false;
    let current = 'prev';
    (clipboard.readText as any).mockImplementation(() => current);
    (clipboard.writeText as any).mockImplementation((t: string) => {
      current = t ?? '';
    });

    const map = createMessageMap(processInfo as any);
    map[Channel.SET_SELECTED_TEXT]({
      channel: Channel.SET_SELECTED_TEXT,
      pid: processInfo.pid,
      value: { text: 'new', hide: false },
    } as any);

    vi.advanceTimersByTime(10); // paste wait
    // Simulate user change before restore
    current = 'user-change';
    vi.advanceTimersByTime(300); // restore delay

    // Should not have overwritten user-change
    expect(clipboard.readText()).toBe('user-change');
  });

  it('KEYBOARD_COPY primary path detects change without fallback', async () => {
    kitState.isMac = true;
    kitState.kenvEnv = { KIT_COPY_POLL_MS: '1', KIT_COPY_MAX_TRIES: '4' };

    let current = 'before';
    (clipboard.readText as any).mockImplementation(() => current);

    const map = createMessageMap(processInfo as any);

    // Start copy; after 2ms, change clipboard
    const p = map[Channel.KEYBOARD_COPY]({ channel: Channel.KEYBOARD_COPY, pid: processInfo.pid, value: {} } as any);
    setTimeout(() => {
      current = 'after';
    }, 2);
    vi.advanceTimersByTime(5);
    await p;

    // Should not have used Ctrl+Insert fallback on mac
    const hasCtrlInsert = keyTap.mock.calls.some((c) => c[0] === 'insert');
    expect(hasCtrlInsert).toBe(false);
    expect(sent.find((d) => d.channel === Channel.KEYBOARD_COPY)).toBeTruthy();
  });

  it('KEYBOARD_COPY uses Ctrl+Insert fallback on non-mac when copy unchanged', async () => {
    kitState.isMac = false;
    kitState.kenvEnv = { KIT_COPY_POLL_MS: '1', KIT_COPY_MAX_TRIES: '2' };
    (clipboard.readText as any).mockReturnValue('same');

    const map = createMessageMap(processInfo as any);
    const p = map[Channel.KEYBOARD_COPY]({ channel: Channel.KEYBOARD_COPY, pid: processInfo.pid, value: {} } as any);
    vi.advanceTimersByTime(10);
    await p;

    // Verify fallback attempted
    const usedInsert = keyTap.mock.calls.some(
      (c) => c[0] === 'insert' && Array.isArray(c[1]) && c[1].includes('control'),
    );
    expect(usedInsert).toBe(true);
  });
});
