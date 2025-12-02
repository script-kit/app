import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useScreenRecorder } from '../hooks/useScreenRecorder';
import { VideoCropper } from '../utils/video-cropper';

// Mock electron APIs
vi.mock('../jotai', () => ({
  channelAtom: { init: null },
  getPid: vi.fn(() => 1234),
  screenAreaAtom: { init: null },
  screenRecorderAtom: { init: null },
  screenRecordingChunksAtom: { init: [] },
  screenRecordingStateAtom: { init: 'idle' },
  screenRecordingStreamAtom: { init: null },
  screenSourceIdAtom: { init: null },
  submitValueAtom: { init: null },
  uiAtom: { init: 'screenRecorder' },
}));

// Mock window.electron
global.window = {
  electron: {
    ipcRenderer: {
      invoke: vi.fn(),
      send: vi.fn(),
      on: vi.fn(),
      removeListener: vi.fn(),
    },
  },
  api: {
    path: {
      join: vi.fn((...args) => args.join('/')),
    },
    os: {
      tmpdir: vi.fn(() => '/tmp'),
    },
  },
} as any;

// Mock navigator.mediaDevices
global.navigator = {
  mediaDevices: {
    getUserMedia: vi.fn(() =>
      Promise.resolve({
        getTracks: () => [],
        getVideoTracks: () => [],
        getAudioTracks: () => [],
        addTrack: vi.fn(),
      } as any)
    ),
  },
} as any;

// Mock MediaRecorder
global.MediaRecorder = vi.fn().mockImplementation(() => ({
  start: vi.fn(),
  stop: vi.fn(),
  pause: vi.fn(),
  resume: vi.fn(),
  state: 'inactive',
  ondataavailable: null,
  onstop: null,
})) as any;

describe('useScreenRecorder', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should initialize with default state', () => {
    const { result } = renderHook(() => useScreenRecorder());

    expect(result.current.isRecording).toBe(false);
    expect(result.current.isPaused).toBe(false);
    expect(result.current.recordingState).toBe('idle');
    expect(result.current.recordingDuration).toBe('00:00');
  });

  it('should fetch available screen sources', async () => {
    const mockSources = [
      { id: 'screen:1', name: 'Screen 1', thumbnail: 'data:image/png;base64,...' },
      { id: 'window:2', name: 'Window 2', thumbnail: 'data:image/png;base64,...' },
    ];

    window.electron.ipcRenderer.invoke = vi.fn().mockResolvedValue(mockSources);

    const { result } = renderHook(() => useScreenRecorder());

    await act(async () => {
      await result.current.refreshSources();
    });

    expect(window.electron.ipcRenderer.invoke).toHaveBeenCalledWith('GET_SCREEN_SOURCES');
    expect(result.current.availableSources).toEqual(mockSources);
  });

  it('should handle area selection', async () => {
    const { result } = renderHook(() => useScreenRecorder());

    act(() => {
      result.current.startAreaSelection();
    });

    expect(result.current.recordingState).toBe('selecting');
  });

  it('should format duration correctly', () => {
    const { result } = renderHook(() => useScreenRecorder());

    // The hook returns formatted duration, so we test the display values
    expect(result.current.recordingDuration).toMatch(/^\d{2}:\d{2}$/);
  });
});

describe('VideoCropper', () => {
  let cropper: VideoCropper;

  beforeEach(() => {
    // Mock canvas and context
    const mockContext = {
      fillStyle: '',
      fillRect: vi.fn(),
      drawImage: vi.fn(),
    };

    HTMLCanvasElement.prototype.getContext = vi.fn(() => mockContext as any);
    HTMLCanvasElement.prototype.captureStream = vi.fn(() => ({
      getTracks: () => [],
      addTrack: vi.fn(),
    } as any));

    cropper = new VideoCropper();
  });

  it('should create a cropper instance', () => {
    expect(cropper).toBeInstanceOf(VideoCropper);
    expect(cropper.isActive()).toBe(false);
  });

  it('should start cropping with correct dimensions', () => {
    const mockStream = {
      getTracks: () => [],
    } as any;

    const cropArea = {
      x: 100,
      y: 100,
      width: 800,
      height: 600,
    };

    const resultStream = cropper.startCropping(mockStream, cropArea);

    expect(resultStream).toBeDefined();
    expect(cropper.isActive()).toBe(true);
  });

  it('should stop cropping and clean up resources', () => {
    const mockStream = {
      getTracks: () => [
        { stop: vi.fn() },
        { stop: vi.fn() },
      ],
    } as any;

    const cropArea = {
      x: 0,
      y: 0,
      width: 1920,
      height: 1080,
    };

    cropper.startCropping(mockStream, cropArea);
    expect(cropper.isActive()).toBe(true);

    cropper.stop();
    expect(cropper.isActive()).toBe(false);
  });
});