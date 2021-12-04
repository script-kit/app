import { useAtom } from 'jotai';
import { useEffect, useRef } from 'react';
import {
  flagValueAtom,
  inputFocusAtom,
  isMouseDownAtom,
  openAtom,
  processingAtom,
  submittedAtom,
} from '../jotai';

export default () => {
  const ref = useRef<HTMLElement>();
  const [flagValue] = useAtom(flagValueAtom);
  const [submitted] = useAtom(submittedAtom);
  const [open] = useAtom(openAtom);
  const [mouseDown] = useAtom(isMouseDownAtom);
  const [inputFocus] = useAtom(inputFocusAtom);
  const [processing] = useAtom(processingAtom);

  useEffect(() => {
    if (inputFocus && ref?.current) {
      ref?.current.focus();
    }
  }, [flagValue, submitted, open, mouseDown, inputFocus, processing]);

  return ref;
};
