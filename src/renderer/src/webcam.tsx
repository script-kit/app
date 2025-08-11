import { UI } from '@johnlindquist/kit/core/enum';
import { useAtom } from 'jotai';
/* eslint-disable react/button-has-type */
/* eslint-disable jsx-a11y/click-events-have-key-events */
/* eslint-disable jsx-a11y/no-static-element-interactions */
import React, { useState, useCallback, useRef, useEffect } from 'react';
import useOnEnter from './hooks/useOnEnter';
import { focusedFlagValueAtom, submitValueAtom, webcamIdAtom, webcamStreamAtom } from './jotai';

export default function Webcam() {
  const [stream, setStream] = useAtom(webcamStreamAtom);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [deviceId, setDeviceId] = useAtom(webcamIdAtom);
  const [, submit] = useAtom(submitValueAtom);
  const [, setFlag] = useAtom(focusedFlagValueAtom);

  const [videoAspectRatio, setVideoAspectRatio] = useState(16 / 9); // Default aspect ratio

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
      videoRef.current.onloadedmetadata = () => {
        if (videoRef.current) {
          setVideoAspectRatio(videoRef.current.videoWidth / videoRef.current.videoHeight);
        }
      };
    }
  }, [stream]);

  useEffect(() => {
    const getDevices = async () => {
      const mediaDevices = await navigator.mediaDevices.enumerateDevices();
      setDevices(mediaDevices.filter((device) => device.kind === 'videoinput'));
    };
    getDevices();
  }, []);

  const startWebcam = useCallback(async () => {
    try {
      const videoConstraints = {
        video: deviceId ? { deviceId } : true,
      };
      const mediaStream = await navigator.mediaDevices.getUserMedia(videoConstraints);
      setStream(mediaStream);
    } catch (err) {
      console.error('Error accessing webcam:', err);
    }
  }, [deviceId, setStream]);

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  useEffect(() => {
    startWebcam();
  }, [deviceId, startWebcam]);

  const takeSelfie = useCallback(() => {
    if (videoRef.current) {
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');
      const video = videoRef.current;

      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      let data = null;
      if (context) {
        // flip horizontally
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        context.translate(canvas.width, 0);
        context.scale(-1, 1);
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        data = canvas.toDataURL('image/png');
      }

      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
        setStream(null);
        if (document.getElementById('webcam')) {
          (document.getElementById('webcam') as HTMLVideoElement).srcObject = null;
        }
      }
      submit(data);

      // remove the canvas
      canvas.remove();
    }
  }, [setStream, stream, submit]);

  useOnEnter(takeSelfie);

  return (
    <div id={UI.webcam} className="flex h-full w-full items-center justify-center overflow-hidden">
      {stream && (
        <div className="relative h-full w-full">
          <video
            id="webcam"
            ref={videoRef}
            autoPlay={true}
            playsInline={true}
            muted={true}
            onClick={takeSelfie}
            className="absolute left-1/2 top-1/2 h-full w-auto max-w-none object-cover"
            style={{
              transform: 'translate(-50%, -50%) scaleX(-1)',
              aspectRatio: videoAspectRatio,
            }}
          />
        </div>
      )}
    </div>
  );
}
