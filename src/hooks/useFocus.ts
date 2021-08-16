import { useAtom } from 'jotai';
import { useEffect, useRef } from 'react';
import {
  flagValueAtom,
  isMouseDownAtom,
  openAtom,
  submittedAtom,
} from '../jotai';

export default () => {
  const ref = useRef<HTMLElement>();
  const [flagValue] = useAtom(flagValueAtom);
  const [submitted] = useAtom(submittedAtom);
  const [open] = useAtom(openAtom);
  const [mouseDown] = useAtom(isMouseDownAtom);

  useEffect(() => {
    if (ref?.current) ref?.current.focus();
  }, [flagValue, submitted, open, mouseDown]);

  return ref;
};
