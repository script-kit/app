import useResizeObserver from '@react-hook/resize-observer';
import { useAtom } from 'jotai';
import { type RefObject, useCallback, useRef } from 'react';
import { mainHeightAtom, openAtom } from '../jotai';

export default <T extends HTMLElement = HTMLElement>(selector = '') => {
  const containerRef = useRef<T | null>(null);
  const [, setMainHeight] = useAtom(mainHeightAtom);
  const [isOpen] = useAtom(openAtom);

  const update = useCallback(() => {
    if (!isOpen) return;

    const wrapper =
      (selector ? document.querySelector<HTMLElement>(selector) : null) ?? (containerRef.current as HTMLElement | null);

    if (!wrapper) return;

    const height = wrapper.offsetHeight;
    if (!Number.isFinite(height)) return;

    setMainHeight((prev) => (prev === height ? prev : height));
  }, [isOpen, selector, setMainHeight]);

  useResizeObserver(containerRef as RefObject<HTMLElement>, update);

  return containerRef;
};
