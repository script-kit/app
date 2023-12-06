import React, { useEffect, useRef } from 'react';
import { useAtom } from 'jotai';
import { progressAtom } from './jotai';

export default function ProgressBar() {
  const [progress, setProgress] = useAtom(progressAtom);
  const progressBarRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (progressBarRef.current) {
      progressBarRef.current.style.width = `${progress}%`;
    }
  }, [progress]);

  return (
    <div className="absolute top-0 left-0 h-1 w-screen">
      <div
        ref={progressBarRef}
        className="h-1 bg-gradient-to-b from-primary to-transparent/50 transition-all duration-300 ease-linear"
        style={{ width: '0%' }}
      />
    </div>
  );
}
