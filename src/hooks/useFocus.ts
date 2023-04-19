import { useAtom } from 'jotai';
import { Ref, RefObject, useEffect, useRef } from 'react';
import {
  flagValueAtom,
  inputFocusAtom,
  isHiddenAtom,
  isMouseDownAtom,
  openAtom,
  processingAtom,
  promptDataAtom,
  scriptAtom,
  submittedAtom,
} from '../jotai';

export default (ref: RefObject<HTMLElement>) => {
  const [flagValue] = useAtom(flagValueAtom);
  const [submitted] = useAtom(submittedAtom);
  const [open] = useAtom(openAtom);
  const [mouseDown] = useAtom(isMouseDownAtom);
  const [inputFocus] = useAtom(inputFocusAtom);
  const [processing] = useAtom(processingAtom);
  const [script] = useAtom(scriptAtom);
  const [promptData] = useAtom(promptDataAtom);
  const [isHidden] = useAtom(isHiddenAtom);

  useEffect(() => {
    if (inputFocus && ref?.current) {
      // console.log(`Focusing`, ref?.current);
      ref?.current.focus();
    }
  }, [
    flagValue,
    submitted,
    open,
    inputFocus,
    processing,
    script,
    isHidden,
    promptData,
    ref,
    ref?.current,
  ]);

  // useEffect(() => {
  //   const handleFocusIn = () => {
  //     // ref?.current?.focus();
  //   };
  //   document.addEventListener('focusin', handleFocusIn);
  //   return () => {
  //     document.removeEventListener('focusin', handleFocusIn);
  //   };
  // }, []);

  return ref;
};
