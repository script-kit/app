import log from 'electron-log/renderer';
import { useCallback, useEffect, useRef, useState } from 'react';
const path = window.api.path;
const os = window.api.os;
const { ipcRenderer } = window.electron;
import { Channel, UI } from '@johnlindquist/kit/core/enum';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import useOnEnter from './hooks/useOnEnter';
import {
  audioDotAtom,
  channelAtom,
  getPid,
  micConfigAtom,
  micIdAtom,
  micMediaRecorderAtom,
  micStateAtom,
  submitValueAtom,
  uiAtom,
} from './jotai';

let mountPid: number;
export function useAudioRecorder() {
  const [audioChunks, setAudioChunks] = useState<Blob[]>([]);
  const [, submit] = useAtom(submitValueAtom);
  const micId = useAtomValue(micIdAtom);
  const micConfig = useAtomValue(micConfigAtom);
  const [channel] = useAtom(channelAtom);
  const [volume, setVolume] = useState(0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const setAudioDot = useSetAtom(audioDotAtom);
  const [ui] = useAtom(uiAtom);
  const [, setMicState] = useAtom(micStateAtom);

  useEffect(() => {
    mountPid = getPid();
    setMicState('idle');
  }, []);

  const handleDataAvailable = async (event: BlobEvent) => {
    if (mountPid !== getPid()) {
      stopRecording();
      log.info(`🏞️ Stopping recording... (audio-dot) ${mountPid} doesn't match ${getPid()}`);
      return;
    }

    setAudioChunks((prevAudioChunks) => [...prevAudioChunks, event.data]);
    log.info(`🏞️ Writing to stream... (audio-dot) mount: ${mountPid}, getPid: ${getPid()}`);

    // Write the current chunk to the file
    const arrayBuffer = await event.data.arrayBuffer();

    channel(Channel.MIC_STREAM, {
      type: 'arrayBuffer',
      buffer: Buffer.from(arrayBuffer),
    });
  };

  const handleStop = () => {
    log.info('>>>>>>>>>>> HANDLE STOP...');
    if (recorderRef.current === null) {
      return;
    }
    recorderRef.current.removeEventListener('dataavailable', handleDataAvailable);
    recorderRef.current.removeEventListener('stop', handleStop);
    recorderRef.current = null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  };

  const destroyRecorder = () => {
    log.info(typeof recorderRef?.current);
    if (recorderRef?.current) {
      log.info('Destroying recorder...');
      recorderRef.current.stream.getTracks().forEach((track) => track.stop());
      recorderRef.current.removeEventListener('stop', handleStop);
      recorderRef.current.removeEventListener('dataavailable', handleDataAvailable);
      recorderRef.current = null;
    }

    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }

    // eslint-disable-next-line react-hooks/exhaustive-deps
  };

  const stopRecording = useCallback(async () => {
    log.info('🎙 Stopping recording...', recorderRef.current);
    setMicState('stopped');
    if (recorderRef.current !== null) {
      if (recorderRef.current.state === 'recording') {
        recorderRef.current.stop();
      }
      // destroy the recorder
      log.info('Destroying recorder because stop...');
      destroyRecorder();
      log.info(`Audio chunks: ${audioChunks.length}`);
      if (audioChunks.length === 0) {
        return;
      }
      const type = 'audio/webm;codecs=opus';
      const audioBlob = new Blob(audioChunks, {
        type,
      });

      log.info('>>>>>>>>>>>>>>>>>>>>>>>>>>> micConfig', micConfig);

      const tmpFileName =
        micConfig?.filePath || path.join(os.tmpdir(), `recording_${Math.random().toString(36).substring(7)}.webm`);

      const arrayBuffer = await audioBlob.arrayBuffer();

      window.api.fsPromises.writeFile(tmpFileName, Buffer.from(arrayBuffer));

      log.info(`Audio written to file: ${tmpFileName}`);

      log.info('Submitting audio...');

      channel(Channel.START_MIC, { value: tmpFileName });
      if (ui === UI.mic) {
        submit(tmpFileName);
      } else {
        channel(Channel.STOP_MIC, { value: tmpFileName });
      }
      setAudioChunks([]);
      setAudioDot(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audioChunks, submit, ui]);

  const startRecording = async () => {
    log.info('🎙 Starting recording...', micConfig, recorderRef.current);
    if (!recorderRef.current) {
      await createRecorderRef();
    }
    if (recorderRef.current) {
      setMicState('recording');
      log.info('🎙 Recorder exists...');
      recorderRef.current.addEventListener('dataavailable', handleDataAvailable);
      recorderRef.current.addEventListener('stop', stopRecording);
      log.info(`🎙 Recorder state: ${recorderRef.current.state}`);
      recorderRef.current.start(micConfig?.timeSlice || 200);

      audioContextRef.current = new AudioContext();
      const analyser = audioContextRef.current.createAnalyser();
      analyser.fftSize = 2048;
      const source = audioContextRef.current.createMediaStreamSource(recorderRef.current.stream);
      source.connect(analyser);

      const analyzeVolume = () => {
        const dataArray = new Uint8Array(analyser.frequencyBinCount);
        analyser.getByteFrequencyData(dataArray);
        const sum = dataArray.reduce((acc, val) => acc + val, 0);
        const avg = sum / dataArray.length;

        setVolume(avg);

        if (recorderRef.current && recorderRef.current.state === 'recording') {
          requestAnimationFrame(analyzeVolume);
        }
      };

      analyzeVolume();
    }
  };

  const micMediaRecorder = useAtomValue(micMediaRecorderAtom);

  // TODO: I'm hopeful one day to be able to cache the micMediaRecorder. But since each prompt operates in a separatel window, I'd have to isolate to a single window
  const createRecorderRef = useCallback(() => {
    log.info('🎙 createRecorderRef...', { micId });

    // if (micMediaRecorder) {
    //   log.info(`🎙 Using existing mic media recorder...`);
    //   recorderRef.current = micMediaRecorder;
    //   return new Promise((resolve) => resolve(recorderRef.current));
    // }

    const constraints = {
      audio: micId ? { deviceId: micId } : true,
    };

    return (
      navigator.mediaDevices
        .getUserMedia(constraints)
        // eslint-disable-next-line promise/always-return
        .then((stream) => {
          const mediaRecorder = new MediaRecorder(stream);

          recorderRef.current = mediaRecorder;
        })
        .catch((err) => {
          log.info(`Error connecting to mic... ${err}`);
        })
    );
  }, [micId]);

  useEffect(() => {
    // eslint-disable-next-line promise/catch-or-return, promise/always-return
    createRecorderRef().then(() => {
      startRecording();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [createRecorderRef]);

  useEffect(() => {
    recorderRef.current = null;
  }, []);

  useEffect(() => {
    log.info('Mic mounted. Setting up...');
    return () => {
      if (recorderRef.current !== null && recorderRef.current.state === 'recording') {
        recorderRef.current.stop();
        log.info('Mic unmounted. Stopping tracks and clearing audio chunks...');
        destroyRecorder();
        setAudioChunks([]);
      }

      // Remove all event listeners from recorderRef.current
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const handleStopMic = () => {
      stopRecording();
    };

    ipcRenderer.on(Channel.STOP_MIC, handleStopMic);

    return () => {
      ipcRenderer.removeListener(Channel.STOP_MIC, handleStopMic);
    };
  }, [stopRecording]);

  useOnEnter(stopRecording);

  return {
    audioChunks,
    startRecording,
    stopRecording,
    setAudioChunks,
    volume,
  };
}
