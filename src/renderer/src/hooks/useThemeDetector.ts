/* eslint-disable react-hooks/exhaustive-deps */
import { useCallback, useEffect } from 'react';

export default () => {
  const mqListener = useCallback((e: MediaQueryListEvent) => {
    // if (isLinux) {
    //   document.documentElement.style.setProperty('--opacity', '1');
    // } else if (e.matches) {
    //   document.documentElement.style.setProperty('--opacity', '0.5');
    // } else {
    //   document.documentElement.style.setProperty('--opacity', '0.5');
    // }
  }, []);

  useEffect(() => {
    mqListener(window.matchMedia('(prefers-color-scheme: dark)') as any);

    const darkThemeMq = window.matchMedia('(prefers-color-scheme: dark)');
    darkThemeMq.addEventListener('change', mqListener);
    return () => darkThemeMq.removeEventListener('change', mqListener);
  }, []);
};
