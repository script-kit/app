import { useAtom } from 'jotai';
import { type RefObject, useEffect } from 'react';
import {
  flaggedChoiceValueAtom,
  inputFocusAtom,
  isHiddenAtom,
  openAtom,
  processingAtom,
  promptDataAtom,
  scriptAtom,
  submittedAtom,
} from '../jotai';
import { createLogger } from '../../../shared/log-utils';

const log = createLogger('useFocus');

export default (ref: RefObject<HTMLElement>) => {
  const [flagValue] = useAtom(flaggedChoiceValueAtom);
  const [submitted] = useAtom(submittedAtom);
  const [open] = useAtom(openAtom);
  const [inputFocus] = useAtom(inputFocusAtom);
  const [processing] = useAtom(processingAtom);
  const [script] = useAtom(scriptAtom);
  const [promptData] = useAtom(promptDataAtom);
  const [isHidden] = useAtom(isHiddenAtom);

  useEffect(() => {
    if (ref?.current) {
      log.info('🏆 Focusing', ref?.current?.tagName);
      ref?.current.focus();
    }
  }, [flagValue, submitted, open, inputFocus, processing, script, isHidden, promptData, ref, ref?.current]);

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
