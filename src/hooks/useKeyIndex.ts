import { useAtom } from 'jotai';

import { useHotkeys } from 'react-hotkeys-hook';
import { indexAtom, mouseEnabledAtom } from '../jotai';

import { hotkeysOptions } from './shared';

export default () => {
  const [index, setIndex] = useAtom(indexAtom);
  const [, setMouseEnabled] = useAtom(mouseEnabledAtom);

  useHotkeys(
    'up',
    (event) => {
      event.preventDefault();
      setMouseEnabled(0);
      setIndex(index - 1);
    },
    hotkeysOptions,
    [index]
  );

  useHotkeys(
    'down',
    (event) => {
      event.preventDefault();
      setMouseEnabled(0);
      setIndex(index + 1);
    },
    hotkeysOptions,
    [index]
  );
};
