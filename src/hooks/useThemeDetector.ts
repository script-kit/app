/* eslint-disable react-hooks/exhaustive-deps */
import { platform } from 'process';
import { useCallback, useEffect } from 'react';

export default () => {
  // set a variable to "isLinux". Don't use "platform" because it's deprecated
  const isLinux = platform === 'linux';

  const mqListener = useCallback((e: MediaQueryListEvent) => {
    if (isLinux) {
      // Linux doesn't support transparency??
      document.documentElement.style.setProperty('--opacity', '1');
    } else if (e.matches) {
      document.documentElement.style.setProperty('--opacity', '0.75');
    } else {
      document.documentElement.style.setProperty('--opacity', '0.80');
    }
  }, []);

  useEffect(() => {
    mqListener(window.matchMedia('(prefers-color-scheme: dark)') as any);

    const darkThemeMq = window.matchMedia('(prefers-color-scheme: dark)');
    darkThemeMq.addEventListener('change', mqListener);
    return () => darkThemeMq.removeEventListener('change', mqListener);
  }, []);
};
