import { useAtom } from 'jotai';

import { useHotkeys, Options } from 'react-hotkeys-hook';
import {
  flagValueAtom,
  indexAtom,
  openAtom,
  prevIndexAtom,
  prevInputAtom,
  rawInputAtom,
} from '../jotai';
import { hotkeysOptions } from './shared';

export default () => {
  const [open, setOpen] = useAtom(openAtom);
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
      } else {
        setOpen(false);
      }
    },
    hotkeysOptions,
    [open, flagValue, prevInput, prevIndex, index, input]
  );
};
