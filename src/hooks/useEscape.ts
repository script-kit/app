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
} from '../jotai';
import { hotkeysOptions } from './shared';

export default () => {
  const [open, setOpen] = useAtom(openAtom);
  const [isSplash] = useAtom(isSplashAtom);
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
      } else if (!isSplash) {
        setOpen(false);
      }
    },
    hotkeysOptions,
    [open, flagValue, prevInput, prevIndex, index, input, isSplash]
  );
};
