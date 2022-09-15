/* eslint-disable react-hooks/exhaustive-deps */
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import { useCallback, useEffect } from 'react';
import { appearanceAtom, darkAtom, openAtom } from '../jotai';

export default () => {
  const setDark = useSetAtom(darkAtom);
  const appearance = useAtomValue(appearanceAtom);

  const mqListener = useCallback(
    (e: MediaQueryListEvent) => {
      if (e.media === 'dark') {
        // set --opacity-themedark to 88%
        document.documentElement.style.setProperty(
          '--opacity-themedark',
          '88%'
        );
      }

      if (e.media === 'light') {
        document.documentElement.style.setProperty(
          '--opacity-themelight',
          '88%'
        );
      }

      if (e.media === 'auto') {
        document.documentElement.style.setProperty(
          '--opacity-themedark',
          '66%'
        );
        document.documentElement.style.setProperty(
          '--opacity-themelight',
          '66%'
        );
      }
      if (e.matches) {
        setDark(true);
        document.documentElement.classList.add('dark');
      } else {
        setDark(false);
        document.documentElement.classList.remove('dark');
      }
    },
    [setDark]
  );

  useEffect(() => {
    mqListener({
      media: appearance,
      matches:
        appearance === 'dark' ||
        (appearance === 'auto' &&
          (window.matchMedia('(prefers-color-scheme: dark)') as MediaQueryList)
            ?.matches),
    } as MediaQueryListEvent);

    return () => {};
  }, [appearance]);

  useEffect(() => {
    mqListener(window.matchMedia('(prefers-color-scheme: dark)') as any);

    const darkThemeMq = window.matchMedia('(prefers-color-scheme: dark)');
    darkThemeMq.addEventListener('change', mqListener);
    return () => darkThemeMq.removeEventListener('change', mqListener);
  }, []);
};
