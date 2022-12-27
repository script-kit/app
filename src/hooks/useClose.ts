import { useAtom } from 'jotai';

import { useHotkeys } from 'react-hotkeys-hook';
import { hotkeysOptions } from './hooksConfig';
import { cmdAtom, openAtom } from '../jotai';

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
    [open, cmd]
  );
};
