/* eslint-disable react-hooks/exhaustive-deps */
import { useAtom } from 'jotai';
import { useCallback, useEffect } from 'react';
import { isDefaultTheme } from '../jotai';

export default () => {
  const [isDefault] = useAtom(isDefaultTheme);

  useEffect(() => {
    if (isDefault) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDefault]);

  const mqListener = useCallback((e: MediaQueryListEvent) => {
    if (e.matches) {
      document.documentElement.style.setProperty('--opacity-dark', '0.5');
    } else {
      document.documentElement.style.setProperty('--opacity-dark', '0.85');
    }
  }, []);

  useEffect(() => {
    mqListener(window.matchMedia('(prefers-color-scheme: dark)') as any);

    const darkThemeMq = window.matchMedia('(prefers-color-scheme: dark)');
    darkThemeMq.addEventListener('change', mqListener);
    return () => darkThemeMq.removeEventListener('change', mqListener);
  }, []);
};
