/* eslint-disable no-plusplus */
import React, { useState, useCallback, useEffect } from 'react';

import { useAtom, useAtomValue } from 'jotai';
import {
  channelAtom,
  submitValueAtom,
  _flag,
  micIdAtom,
  audioRecorderAtom,
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
  const [recorder, setRecorder] = useAtom(audioRecorderAtom);
  const [audioChunks, setAudioChunks] = useState<Blob[]>([]);
  const [, submit] = useAtom(submitValueAtom);
  const deviceId = useAtomValue(micIdAtom);
  const [volume, setVolume] = useState(0);

  const [channel] = useAtom(channelAtom);

  const stopRecording = useCallback(async () => {
    console.log(`🛑 STOP RECORDING`, {
      recorder,
    });
    if (recorder) {
      recorder.stop();
      // destroy the recorder
      recorder.stream.getTracks().forEach((track) => track.stop());
      setRecorder(null);

      const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
      const arrayBuffer = Buffer.from(await audioBlob.arrayBuffer());
      const base64 = arrayBufferToBase64(arrayBuffer, 'audio/webm');

      submit(base64);
      setAudioChunks([]);
    }
  }, [audioChunks, recorder, setRecorder, submit]);

  useEffect(() => {
    if (recorder) return;
    console.log(`Starting recording...`);

    const constraints = {
      audio: deviceId ? { deviceId } : true,
    };

    const handleDataAvailable = async (event) => {
      setAudioChunks((prevAudioChunks) => [...prevAudioChunks, event.data]);

      const arrayBuffer = await event.data.arrayBuffer();
      const base64 = arrayBufferToBase64(arrayBuffer, 'audio/webm');
      // channel(Channel.ON_AUDIO_DATA, {
      //   value: base64,
      // });
    };

    // Create an async function to handle the async logic
    const startRecording = async () => {
      if (recorder) return;
      const stream = await navigator.mediaDevices.getUserMedia(constraints);

      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorder.addEventListener('dataavailable', handleDataAvailable);
      mediaRecorder.addEventListener('stop', () => {
        console.log('Stopped recording');
        mediaRecorder.removeEventListener('dataavailable', handleDataAvailable);
        mediaRecorder.removeEventListener('stop', () => {});
        setRecorder(null);
      });
      mediaRecorder.start(500);
      setRecorder(mediaRecorder);

      const audioContext = new AudioContext();
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 2048;
      const source = audioContext.createMediaStreamSource(stream);
      source.connect(analyser);

      const analyzeVolume = () => {
        const dataArray = new Uint8Array(analyser.frequencyBinCount);
        analyser.getByteFrequencyData(dataArray);
        const sum = dataArray.reduce((acc, val) => acc + val, 0);
        const avg = sum / dataArray.length;

        setVolume(avg);

        if (mediaRecorder && mediaRecorder.state === 'recording') {
          requestAnimationFrame(analyzeVolume);
        }
      };

      analyzeVolume();
    };
    startRecording();
  }, [deviceId, recorder]);

  useEffect(() => {
    return () => {
      console.log(`👋 UNMOUNT`);

      if (recorder) {
        if (recorder.state === 'recording') {
          recorder.stop();
          recorder.stream.getTracks().forEach((track) => track.stop());
        }

        setRecorder(null);
      }
    };
  }, [recorder, setRecorder]);

  useOnEnter(stopRecording);

  return (
    <div className="h-full w-full flex flex-col justify-center items-center text-text-base text-xl">
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
