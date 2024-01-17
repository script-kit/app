import { useEffect } from 'react';
import { useAtomValue } from 'jotai';
import { enterPressedAtom } from '../jotai';

export default (callback: () => void) => {
  const enterPressed = useAtomValue(enterPressedAtom);
  useEffect(() => {
    if (enterPressed) {
      callback();
    }
  }, [callback, enterPressed]);
};
