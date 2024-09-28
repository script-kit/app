/* eslint-disable jsx-a11y/no-static-element-interactions */
/* eslint-disable jsx-a11y/click-events-have-key-events */
/* eslint-disable no-plusplus */
import React, { useEffect } from 'react';
import { useAudioRecorder } from './audio-hooks';

export default function AudioDot() {
  const { volume, stopRecording } = useAudioRecorder();

  return (
    <div
      onClick={() => {
        stopRecording();
      }}
      className="absolute top-0 right-0 m-1.5 h-1.5 w-1.5 rounded-full"
      style={{
        backgroundColor: `hsl(${volume * 2}, 100%, 50%, 1)`,
      }}
    />
  );
}
