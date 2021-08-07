import useResizeObserver from '@react-hook/resize-observer';

import { useLayoutEffect, useRef } from 'react';
import { useAtom } from 'jotai';
import { mainHeightAtom, uiAtom } from '../jotai';

export default <T extends HTMLElement = HTMLElement>() => {
  const containerRef = useRef<T>(null);
  const [, setMainHeight] = useAtom(mainHeightAtom);

  // useLayoutEffect(() => {
  //   if (containerRef?.current?.clientHeight) {
  //     setMainHeight(containerRef?.current?.clientHeight);
  //   }
  // }, [containerRef?.current?.clientHeight, setMainHeight]);

  useResizeObserver(containerRef, (entry) => {
    if (entry?.contentRect?.height) {
      setMainHeight(entry.contentRect.height);
    }
  });

  return containerRef;
};
