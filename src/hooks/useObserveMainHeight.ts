import useResizeObserver from '@react-hook/resize-observer';
import { RefObject, useEffect, useRef } from 'react';

import { useAtom } from 'jotai';
import { mainHeightAtom, heightChangedAtom, openAtom } from '../jotai';

export default <T extends HTMLElement = HTMLElement>(selector = '') => {
  const containerRef = useRef<T>();
  const [, setMainHeight] = useAtom(mainHeightAtom);
  const [isOpen] = useAtom(openAtom);

  const update = () => {
    if (!isOpen) return;
    const wrapper: any = document?.querySelector(selector);
    // console.log(`>>> Update`);

    if (wrapper) {
      const styleHeightString = wrapper?.style?.height;
      if (styleHeightString) {
        const styleHeight = parseInt(styleHeightString.replace('px', ''), 10);
        // console.log(`${selector} style height: ${styleHeight}`);
        setMainHeight(styleHeight);
      } else {
        const elHeight = wrapper?.height || wrapper?.clientHeight;

        // console.log(`${selector} el height: ${elHeight}`);
        setMainHeight(elHeight);
      }
    }
  };

  // useLayoutEffect(update, []);
  useResizeObserver(containerRef as RefObject<HTMLElement>, update);
  // useEffect(update, [heightChanged]);

  return containerRef;
};
