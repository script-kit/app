/* eslint-disable jsx-a11y/no-static-element-interactions */
/* eslint-disable jsx-a11y/click-events-have-key-events */
/* eslint-disable no-plusplus */
import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Channel } from '@johnlindquist/kit/cjs/enum';

import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import { ipcRenderer } from 'electron';
import {
  channelAtom,
  submitValueAtom,
  micIdAtom,
  logAtom,
  uiAtom,
  openAtom,
  micConfigAtom,
  audioDotAtom,
} from './jotai';
import useOnEnter from './hooks/useOnEnter';

function arrayBufferToBase64(buffer: ArrayBuffer, mimeType: string): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }

  const base64 = window.btoa(binary);
  return `data:${mimeType};base64,${base64}`;
}

export default function AudioDot() {
  const [audioChunks, setAudioChunks] = useState<Blob[]>([]);
  const [, submit] = useAtom(submitValueAtom);
  const deviceId = useAtomValue(micIdAtom);
  const [volume, setVolume] = useState(0);
  const log = useAtomValue(logAtom);
  const ui = useAtomValue(uiAtom);
  const open = useAtomValue(openAtom);
  const micConfig = useAtomValue(micConfigAtom);

  const [channel] = useAtom(channelAtom);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const setAudioDot = useSetAtom(audioDotAtom);

  const stopRecording = useCallback(async () => {
    if (recorderRef.current !== null) {
      log(`🎙 Stopping recording...`);
      if (recorderRef.current.state === 'recording') recorderRef.current.stop();
      // destroy the recorder
      recorderRef.current.stream.getTracks().forEach((track) => track.stop());
      recorderRef.current = null;

      log(`Audio chunks: ${audioChunks.length}`);
      if (audioChunks.length === 0) return;
      const type = `audio/${micConfig.format}`;
      const audioBlob = new Blob(audioChunks, {
        type,
      });
      const arrayBuffer = Buffer.from(await audioBlob.arrayBuffer());
      const base64 = arrayBufferToBase64(arrayBuffer, type);

      log(`Submitting audio...`);
      channel(Channel.START_MIC, { value: base64 });
      setAudioChunks([]);
      setAudioDot(false);
    }
  }, [audioChunks, log, submit]);

  const startRecording = useCallback(async () => {
    if (recorderRef.current === null) return;
    log(`🎤 Starting recording...`);

    const handleDataAvailable = async (event) => {
      setAudioChunks((prevAudioChunks) => [...prevAudioChunks, event.data]);
      if (micConfig.stream) {
        const arrayBuffer = await event.data.arrayBuffer();
        const type = `audio/${micConfig.format}`;

        const base64 = arrayBufferToBase64(arrayBuffer, type);
        channel(Channel.ON_AUDIO_DATA, {
          value: base64,
        });
      }
    };

    log(`Got recorder... ${recorderRef.current}`);
    recorderRef.current.addEventListener('dataavailable', handleDataAvailable);
    recorderRef.current.addEventListener('stop', () => {
      // console.log('Stopped recording');

      if (recorderRef.current === null) return;
      recorderRef.current.removeEventListener(
        'dataavailable',
        handleDataAvailable
      );
      recorderRef.current.removeEventListener('stop', () => {});
      recorderRef.current = null;
    });
    recorderRef.current.start(micConfig.timeSlice);

    const audioContext = new AudioContext();
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 2048;
    const source = audioContext.createMediaStreamSource(
      recorderRef.current.stream
    );
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
  }, [channel, log]);

  useEffect(() => {
    if (open && recorderRef.current === null) {
      const constraints = {
        audio: deviceId ? { deviceId } : true,
      };

      navigator.mediaDevices
        .getUserMedia(constraints)
        .then((stream) => {
          const mediaRecorder = new MediaRecorder(stream);

          recorderRef.current = mediaRecorder;
          startRecording();
          return null;
        })
        .catch((err) => {
          log(`Error connecting to mic... ${err}`);
        });
    }
  }, [open, deviceId, startRecording, log]);

  useEffect(() => {
    recorderRef.current = null;
  }, []);

  useEffect(() => {
    return () => {
      if (
        recorderRef.current !== null &&
        recorderRef.current.state === 'recording'
      ) {
        recorderRef.current.stop();
        log(`Mic unmounted. Stopping tracks and clearing audio chunks...`);
        recorderRef.current.stream.getTracks().forEach((track) => track.stop());
        setAudioChunks([]);
      }
    };
  }, [log]);

  useEffect(() => {
    const handleStopMic = () => {
      log(`>>> Handling stop mic...`);
      stopRecording();
    };

    ipcRenderer.on(Channel.STOP_MIC, handleStopMic);

    return () => {
      ipcRenderer.removeListener(Channel.STOP_MIC, handleStopMic);
    };
  }, [log, stopRecording]);

  useOnEnter(stopRecording);

  return (
    <>
      <div
        onClick={() => {
          stopRecording();
        }}
        className="h-1.5 w-1.5 rounded-full"
        style={{
          backgroundColor: `hsl(${volume * 2}, 100%, 50%, 1)`,
        }}
      />
    </>
  );
}
