import { useAtom } from 'jotai';
import { useLayoutEffect, useRef } from 'react';
import { mainHeightAtom } from '../jotai';

export default () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [, setMainHeight] = useAtom(mainHeightAtom);
  useLayoutEffect(() => {
    const ch = containerRef?.current?.clientHeight || 0;
    setMainHeight(ch);
  }, [setMainHeight, containerRef?.current?.clientHeight]);

  return containerRef;
};
