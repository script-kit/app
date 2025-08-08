import { useAtom } from 'jotai';
import { type RefObject, useEffect } from 'react';
import {
  devToolsOpenAtom,
  flaggedChoiceValueAtom,
  inputFocusAtom,
  isHiddenAtom,
  openAtom,
  processingAtom,
  promptDataAtom,
  scriptAtom,
  submittedAtom,
} from "../state";
import { createLogger } from '../log-utils';

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
  const [devToolsOpen] = useAtom(devToolsOpenAtom);

  useEffect(() => {
    // Don't steal focus when DevTools are open
    if (ref?.current && open && window?.pid && document.activeElement !== ref?.current && !devToolsOpen) {
      log.info(`${window?.pid}: 🏆 Focusing`, ref?.current?.tagName, document.activeElement?.tagName);
      ref?.current?.focus();
    }
  }, [flagValue, submitted, open, inputFocus, processing, script, isHidden, promptData, ref, ref?.current, devToolsOpen]);

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
