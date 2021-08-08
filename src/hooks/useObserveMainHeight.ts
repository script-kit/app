import useResizeObserver from '@react-hook/resize-observer';
import { RefObject, useRef } from 'react';

import { useAtom } from 'jotai';
import { mainHeightAtom } from '../jotai';

export default <T extends HTMLElement = HTMLElement>() => {
  const containerRef = useRef<T>();
  const [, setMainHeight] = useAtom(mainHeightAtom);

  // useLayoutEffect(() => {
  //   if (containerRef?.current?.clientHeight) {
  //     setMainHeight(containerRef?.current?.clientHeight);
  //   }
  // }, [containerRef?.current?.clientHeight, setMainHeight]);

  useResizeObserver(containerRef as RefObject<HTMLElement>, (entry) => {
    if (entry?.contentRect?.height) {
      setMainHeight(entry.contentRect.height);
    }
  });

  return containerRef;
};
