import useResizeObserver from '@react-hook/resize-observer';
import { RefObject, useRef } from 'react';
import { debounce } from 'lodash-es';
import { useAtom } from 'jotai';
import { mainHeightAtom, openAtom } from '../jotai';

export default <T extends HTMLElement = HTMLElement>(selector = '') => {
  const containerRef = useRef<T>();
  const [, setMainHeight] = useAtom(mainHeightAtom);
  const [isOpen] = useAtom(openAtom);

  const update = debounce(() => {
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
        const elHeight = wrapper?.offsetHeight;

        // console.log(`${selector} el height: ${elHeight}`);
        setMainHeight(elHeight);
      }
    }
  }, 100);

  // useLayoutEffect(update, []);
  useResizeObserver(containerRef as RefObject<HTMLElement>, update);
  // useEffect(update, [heightChanged]);

  return containerRef;
};
