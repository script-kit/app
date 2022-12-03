/* eslint-disable react-hooks/exhaustive-deps */
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import { useCallback, useEffect } from 'react';
import { appearanceAtom, darkAtom, openAtom } from '../jotai';

export default () => {
  const [isDark] = useAtom(darkAtom);

  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDark]);

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
