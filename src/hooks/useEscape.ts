import { useAtom } from 'jotai';

import { useHotkeys } from 'react-hotkeys-hook';
import {
  flagValueAtom,
  _index,
  openAtom,
  prevIndexAtom,
  prevInputAtom,
  _input,
  isReadyAtom,
  escapeAtom,
} from '../jotai';
import { hotkeysOptions } from './shared';

export default () => {
  const [open] = useAtom(openAtom);
  const [, escape] = useAtom(escapeAtom);
  const [isReady] = useAtom(isReadyAtom);
  const [flagValue, setFlagValue] = useAtom(flagValueAtom);
  const [input] = useAtom(_input);
  const [prevInput] = useAtom(prevInputAtom);

  const [index] = useAtom(_index);
  const [prevIndex] = useAtom(prevIndexAtom);

  useHotkeys(
    'escape',
    (event) => {
      event.preventDefault();
      if (flagValue) {
        setFlagValue('');
      } else if (isReady) {
        escape();
      }
    },
    hotkeysOptions,
    [open, flagValue, prevInput, prevIndex, index, input, isReady]
  );
};
