import { useAtom } from 'jotai';

import { Options, useHotkeys } from 'react-hotkeys-hook';
import { hotkeysOptions } from './shared';
import { openAtom } from '../jotai';

export default () => {
  const [open, setOpen] = useAtom(openAtom);

  useHotkeys(
    'cmd+w,ctrl+w',
    (event) => {
      event.preventDefault();
      setOpen(false);
    },
    hotkeysOptions,
    [open]
  );
};
