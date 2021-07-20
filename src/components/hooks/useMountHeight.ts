import { useEffect, useLayoutEffect, useRef } from 'react';
import { useAtom } from 'jotai';
import { mainHeightAtom } from '../../jotai';

export default () => {
  const containerRef = useRef(null);
  const [, setMainHeight] = useAtom(mainHeightAtom);
  useLayoutEffect(() => {
    setMainHeight(containerRef?.current?.clientHeight || 480);
  }, [setMainHeight]);

  return containerRef;
};
