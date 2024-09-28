import { useAtom } from 'jotai';

import { useHotkeys } from 'react-hotkeys-hook';
import { cmdAtom, openAtom } from '../jotai';
import { hotkeysOptions } from './shared';

export default () => {
  const [open, setOpen] = useAtom(openAtom);
  const [cmd] = useAtom(cmdAtom);

  useHotkeys(
    `${cmd}+w`,
    (event) => {
      event.preventDefault();
      setOpen(false);
    },
    hotkeysOptions,
    [open, cmd],
  );
};
