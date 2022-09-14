/* eslint-disable react-hooks/exhaustive-deps */
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import { useCallback, useEffect } from 'react';
import { appearanceAtom, darkAtom, openAtom } from '../jotai';

export default () => {
  const setDark = useSetAtom(darkAtom);
  const appearance = useAtomValue(appearanceAtom);

  const mqListener = useCallback(
    (e: MediaQueryListEvent) => {
      if (e.matches) {
        setDark(true);
        document.body.classList.add('dark');
      } else {
        setDark(false);
        document.body.classList.remove('dark');
      }
    },
    [setDark]
  );

  useEffect(() => {
    if (appearance === 'auto') {
      const darkThemeMq = window.matchMedia('(prefers-color-scheme: dark)');
      darkThemeMq.addEventListener('change', mqListener);
      return () => darkThemeMq.removeEventListener('change', mqListener);
    }

    mqListener({
      matches: appearance === 'dark',
    } as MediaQueryListEvent);

    return () => {};
  }, [appearance]);

  useEffect(() => {
    mqListener(window.matchMedia('(prefers-color-scheme: dark)') as any);
  }, []);
};
