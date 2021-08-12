/* eslint-disable react-hooks/exhaustive-deps */
import { useAtom } from 'jotai';
import { useEffect } from 'react';
import { darkAtom } from '../jotai';

export default () => {
  const [, setDark] = useAtom(darkAtom);

  const mqListener = (e: MediaQueryListEvent) => {
    setDark(e.matches);
  };

  useEffect(() => {
    const darkThemeMq = window.matchMedia('(prefers-color-scheme: dark)');
    darkThemeMq.addEventListener('change', mqListener);
    return () => darkThemeMq.removeEventListener('change', mqListener);
  }, []);
};
