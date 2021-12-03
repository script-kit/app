import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useAtom } from 'jotai';
import { loadingAtom } from '../jotai';

export default function TopBar() {
  const [loading] = useAtom(loadingAtom);
  const [animateBar, setAnimateBar] = useState(false);
  const animationStart = useCallback((event) => {
    if (event.animationName === 'fadeIn') {
      setAnimateBar(true);
    }
  }, []);
  const animationEnd = useCallback((event) => {
    if (event.animationName === 'fadeOut') {
      setAnimateBar(false);
    }
  }, []);

  return (
    <div
      onAnimationStart={animationStart}
      onAnimationEnd={animationEnd}
      style={{ height: '2px' }}
      className={`absolute top-0 left-0 w-full
      animate-fade-${loading ? 'in' : 'out'}
      `}
    >
      <div
        className={`
          ${
            animateBar ? `animate-loading` : ``
          } bg-primary-dark dark:bg-primary-light h-full w-10 absolute top-0`}
      />
    </div>
  );
}
