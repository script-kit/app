import { Channel, UI } from '@johnlindquist/kit/core/enum';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import { useCallback, useEffect, useRef, useState } from 'react';
import log from 'electron-log';
import {
  channelAtom,
  getPid,
  screenAreaAtom,
  screenRecorderAtom,
  screenRecordingChunksAtom,
  screenRecordingStateAtom,
  screenRecordingStreamAtom,
  screenSourceIdAtom,
  submitValueAtom,
  uiAtom,
} from '../jotai';
import { createCroppedStream, stopCroppedStream } from '../utils/video-cropper';

const { ipcRenderer } = window.electron;
const path = window.api.path;
const os = window.api.os;

interface UseScreenRecorderOptions {
  format?: 'webm' | 'mp4';
  quality?: number;
  frameRate?: number;
  timeSlice?: number;
  filePath?: string;
  enableAudio?: boolean;
}

interface ScreenSource {
  id: string;
  name: string;
  thumbnail: string;
}

let mountPid: number;

export function useScreenRecorder(options: UseScreenRecorderOptions = {}) {
  const {
    format = 'webm',
    quality = 0.9,
    frameRate = 30,
    timeSlice = 1000, // 1 second chunks
    filePath,
    enableAudio = false,
  } = options;

  // State atoms
  const [recordingState, setRecordingState] = useAtom(screenRecordingStateAtom);
  const [screenArea] = useAtom(screenAreaAtom);
  const [sourceId, setSourceId] = useAtom(screenSourceIdAtom);
  const [stream, setStream] = useAtom(screenRecordingStreamAtom);
  const [chunks, setChunks] = useAtom(screenRecordingChunksAtom);
  const [recorder, setRecorder] = useAtom(screenRecorderAtom);
  const [, submit] = useAtom(submitValueAtom);
  const [channel] = useAtom(channelAtom);
  const [ui] = useAtom(uiAtom);

  // Local state
  const [availableSources, setAvailableSources] = useState<ScreenSource[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const durationInterval = useRef<NodeJS.Timeout | null>(null);

  // Initialize on mount
  useEffect(() => {
    mountPid = getPid();
    setRecordingState('idle');
    fetchScreenSources();

    return () => {
      // Clean up all resources on unmount
      if (durationInterval.current) {
        clearInterval(durationInterval.current);
        durationInterval.current = null;
      }

      // Stop any active recording
      if (recorder && recorder.state !== 'inactive') {
        recorder.stop();
      }

      // Clean up stream
      if (stream) {
        stopCroppedStream(stream);
      }

      // Clear chunks to free memory
      setChunks([]);

      // Reset all states
      setRecorder(null);
      setStream(null);
      setIsRecording(false);
      setIsPaused(false);
      setRecordingDuration(0);
    };
  }, []);

  // Fetch available screen sources
  const fetchScreenSources = useCallback(async () => {
    try {
      const sources = await ipcRenderer.invoke(Channel.GET_SCREEN_SOURCES);
      setAvailableSources(sources);

      // Auto-select primary display if none selected
      if (!sourceId && sources.length > 0) {
        setSourceId(sources[0].id);
      }
    } catch (error) {
      log.error('Failed to fetch screen sources:', error);
    }
  }, [sourceId, setSourceId]);

  // Handle data available from recorder
  const handleDataAvailable = useCallback(
    async (event: BlobEvent) => {
      if (mountPid !== getPid()) {
        stopRecording();
        log.info(`🎬 Stopping recording... PIDs don't match`);
        return;
      }

      setChunks((prevChunks) => [...prevChunks, event.data]);

      // Stream data to main process for progressive saving
      if (event.data.size > 0) {
        const arrayBuffer = await event.data.arrayBuffer();
        channel(Channel.SCREEN_RECORDING_STREAM, {
          type: 'arrayBuffer',
          buffer: Buffer.from(arrayBuffer),
        });
      }
    },
    [channel, setChunks]
  );

  // Handle recording stop
  const handleStop = useCallback(() => {
    log.info('🎬 Recording stopped');
    setIsRecording(false);
    setRecordingState('idle');

    if (durationInterval.current) {
      clearInterval(durationInterval.current);
      durationInterval.current = null;
    }
  }, [setRecordingState]);

  // Start area selection
  const startAreaSelection = useCallback(async () => {
    setRecordingState('selecting');

    // The area selector component will handle the selection
    // and call back with the selected area
  }, [setRecordingState]);

  // Start recording with selected area
  const startRecording = useCallback(async () => {
    try {
      if (!sourceId) {
        log.error('No source selected for recording');
        return;
      }

      if (!screenArea) {
        log.error('No area selected for recording');
        await startAreaSelection();
        return;
      }

      log.info('🎬 Starting screen recording...', { sourceId, screenArea });

      // Check permissions
      const permissionResult = await ipcRenderer.invoke(Channel.START_SCREEN_RECORDING, {
        sourceId,
        area: screenArea,
      });

      if (!permissionResult.success) {
        log.error('Failed to start recording:', permissionResult.error);
        throw new Error(permissionResult.error || 'Permission denied');
      }

      // Create cropped stream
      const recordingStream = await createCroppedStream(sourceId, screenArea, {
        video: {
          frameRate,
        },
      });

      // Add audio track if enabled
      if (enableAudio) {
        try {
          const audioStream = await navigator.mediaDevices.getUserMedia({
            audio: true,
            video: false,
          });
          audioStream.getAudioTracks().forEach(track => {
            recordingStream.addTrack(track);
          });
        } catch (error) {
          log.warn('Failed to add audio track:', error);
        }
      }

      setStream(recordingStream);

      // Set up MediaRecorder
      const mimeType = format === 'mp4' ? 'video/mp4' : 'video/webm;codecs=vp9';
      const mediaRecorder = new MediaRecorder(recordingStream, {
        mimeType,
        videoBitsPerSecond: 2500000, // 2.5 Mbps
      });

      mediaRecorder.ondataavailable = handleDataAvailable;
      mediaRecorder.onstop = handleStop;

      // Start recording
      mediaRecorder.start(timeSlice);
      setRecorder(mediaRecorder);
      setIsRecording(true);
      setRecordingState('recording');
      setRecordingDuration(0);

      // Start duration timer
      durationInterval.current = setInterval(() => {
        setRecordingDuration(prev => prev + 1);
      }, 1000);

      log.info('🎬 Recording started successfully');
    } catch (error) {
      log.error('Failed to start recording:', error);

      // Clean up on error
      if (recordingStream) {
        stopCroppedStream(recordingStream);
      }

      if (durationInterval.current) {
        clearInterval(durationInterval.current);
        durationInterval.current = null;
      }

      setStream(null);
      setRecorder(null);
      setIsRecording(false);
      setRecordingState('idle');
      setRecordingDuration(0);
    }
  }, [
    sourceId,
    screenArea,
    enableAudio,
    format,
    frameRate,
    timeSlice,
    handleDataAvailable,
    handleStop,
    setStream,
    setRecorder,
    setRecordingState,
    startAreaSelection,
  ]);

  // Pause recording
  const pauseRecording = useCallback(() => {
    if (recorder && recorder.state === 'recording') {
      recorder.pause();
      setIsPaused(true);
      setRecordingState('paused');

      if (durationInterval.current) {
        clearInterval(durationInterval.current);
        durationInterval.current = null;
      }

      log.info('🎬 Recording paused');
    }
  }, [recorder, setRecordingState]);

  // Resume recording
  const resumeRecording = useCallback(() => {
    if (recorder && recorder.state === 'paused') {
      recorder.resume();
      setIsPaused(false);
      setRecordingState('recording');

      // Restart duration timer
      durationInterval.current = setInterval(() => {
        setRecordingDuration(prev => prev + 1);
      }, 1000);

      log.info('🎬 Recording resumed');
    }
  }, [recorder, setRecordingState]);

  // Stop recording and save file
  const stopRecording = useCallback(async () => {
    log.info('🎬 Stopping recording...');
    setRecordingState('idle');
    setIsRecording(false);
    setIsPaused(false);

    if (durationInterval.current) {
      clearInterval(durationInterval.current);
      durationInterval.current = null;
    }

    if (recorder && recorder.state !== 'inactive') {
      recorder.stop();
    }

    if (stream) {
      stopCroppedStream(stream);
      setStream(null);
    }

    // Process and save chunks
    if (chunks.length > 0) {
      const mimeType = format === 'mp4' ? 'video/mp4' : 'video/webm';
      const blob = new Blob(chunks, { type: mimeType });
      const arrayBuffer = await blob.arrayBuffer();

      // Determine file path
      const tmpDir = path.join(os.tmpdir(), 'kit-screen-recordings');
      const fileName = `screen-recording-${Date.now()}.${format}`;
      const savePath = filePath || path.join(tmpDir, fileName);

      // Save via IPC
      const result = await ipcRenderer.invoke(Channel.STOP_SCREEN_RECORDING, {
        buffer: arrayBuffer,
        filePath: savePath,
      });

      if (result.success) {
        log.info(`🎬 Recording saved to: ${result.filePath}`);

        // Submit the file path if in screenRecorder UI
        if (ui === UI.screenRecorder) {
          submit(result.filePath);
        } else {
          channel(Channel.STOP_SCREEN_RECORDING, { value: result.filePath });
        }
      } else {
        log.error('Failed to save recording:', result.error);
      }

      // Clear chunks
      setChunks([]);
    }

    setRecorder(null);
    setRecordingDuration(0);
  }, [recorder, stream, chunks, format, filePath, ui, submit, channel, setStream, setChunks, setRecorder, setRecordingState]);

  // Format duration for display
  const formatDuration = (seconds: number): string => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    if (hrs > 0) {
      return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Listen for area selection from the selector component
  useEffect(() => {
    const handleAreaSelected = (_event: any, data: any) => {
      if (data.area) {
        log.info('Area selected:', data.area);
        // Automatically start recording after area selection
        if (recordingState === 'selecting') {
          startRecording();
        }
      }
    };

    ipcRenderer.on(Channel.SCREEN_AREA_SELECTED, handleAreaSelected);

    return () => {
      // Use the correct method: off() instead of removeListener()
      ipcRenderer.off(Channel.SCREEN_AREA_SELECTED, handleAreaSelected);
    };
  }, [recordingState, startRecording]);

  return {
    // State
    isRecording,
    isPaused,
    recordingState,
    recordingDuration: formatDuration(recordingDuration),
    availableSources,
    selectedSourceId: sourceId,
    selectedArea: screenArea,

    // Actions
    startAreaSelection,
    startRecording,
    pauseRecording,
    resumeRecording,
    stopRecording,
    selectSource: setSourceId,
    refreshSources: fetchScreenSources,
  };
}