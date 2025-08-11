import { atomEffect } from 'jotai-effect';
import { webcamStreamAtom } from '../jotai';

export const webcamEffect = atomEffect((get) => {
  const stream = get(webcamStreamAtom);

  const video = document.getElementById('webcam') as HTMLVideoElement | null;

  if (stream && video) {
    video.srcObject = stream;
  } else if (video) {
    video.srcObject = null;
  }

  return () => {
    stream?.getTracks().forEach((t) => t.stop());
    if (video) video.srcObject = null;
  };
});
