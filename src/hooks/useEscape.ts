import { useAtom } from 'jotai';

import { useHotkeys } from 'react-hotkeys-hook';
import {
  flagValueAtom,
  indexAtom,
  openAtom,
  prevIndexAtom,
  prevInputAtom,
  rawInputAtom,
  isSplashAtom,
  isReadyAtom,
  escapeAtom,
} from '../jotai';
import { hotkeysOptions } from './shared';

export default () => {
  const [open, setOpen] = useAtom(openAtom);
  const [, escape] = useAtom(escapeAtom);
  const [isSplash] = useAtom(isSplashAtom);
  const [isReady] = useAtom(isReadyAtom);
  const [flagValue, setFlagValue] = useAtom(flagValueAtom);
  const [input] = useAtom(rawInputAtom);
  const [prevInput] = useAtom(prevInputAtom);

  const [index] = useAtom(indexAtom);
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
