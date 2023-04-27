/* eslint-disable no-plusplus */
import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Channel, UI } from '@johnlindquist/kit/cjs/enum';
import { useAtom, useAtomValue } from 'jotai';
import {
  channelAtom,
  submitValueAtom,
  micIdAtom,
  audioRecorderAtom,
  logAtom,
  uiAtom,
  openAtom,
  micConfigAtom,
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

export default function AudioRecorder() {
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

  const stopRecording = useCallback(async () => {
    if (recorderRef.current !== null) {
      log(`🎙 Stopping recording...`);
      if (recorderRef.current.state === 'recording') recorderRef.current.stop();
      // destroy the recorder
      recorderRef.current.stream.getTracks().forEach((track) => track.stop());
      recorderRef.current = null;

      if (audioChunks.length === 0) return;
      const type = `audio/${micConfig.format}`;
      const audioBlob = new Blob(audioChunks, {
        type,
      });
      const arrayBuffer = Buffer.from(await audioBlob.arrayBuffer());
      const base64 = arrayBufferToBase64(arrayBuffer, type);

      log(`Submitting audio...`);
      submit(base64);
      setAudioChunks([]);
    }
  }, [audioChunks, log, submit]);

  const startRecording = useCallback(async () => {
    if (recorderRef.current === null) return;
    log(`🎤 Starting recording...`);

    const handleDataAvailable = async (event) => {
      setAudioChunks((prevAudioChunks) => [...prevAudioChunks, event.data]);

      const arrayBuffer = await event.data.arrayBuffer();
      const type = `audio/${micConfig.format}`;

      const base64 = arrayBufferToBase64(arrayBuffer, type);
      channel(Channel.ON_AUDIO_DATA, {
        value: base64,
      });
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
    if (ui === UI.mic && open && recorderRef.current === null) {
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
  }, [ui, open, deviceId, startRecording, log]);

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

  useOnEnter(stopRecording);

  return (
    <div
      id={UI.mic}
      className="h-full w-full flex flex-col justify-center items-center text-text-base text-xl"
    >
      <h1 className="text-5xl">Recording</h1>
      {/* A circle that represents the recording state */}
      <div
        className="h-4 w-4 rounded-full mt-4"
        style={{
          backgroundColor: `hsl(${volume * 2}, 100%, 50%, 1)`,
        }}
      />
    </div>
  );
}
