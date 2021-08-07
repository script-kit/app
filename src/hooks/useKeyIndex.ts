import { useAtom } from 'jotai';

import { useHotkeys } from 'react-hotkeys-hook';
import { indexAtom } from '../jotai';

import { hotkeysOptions } from './shared';

export default () => {
  const [index, setIndex] = useAtom(indexAtom);

  useHotkeys(
    'up',
    (event) => {
      event.preventDefault();
      setIndex(index - 1);
    },
    hotkeysOptions,
    [index]
  );

  useHotkeys(
    'down',
    (event) => {
      event.preventDefault();
      setIndex(index + 1);
    },
    hotkeysOptions,
    [index]
  );
};
