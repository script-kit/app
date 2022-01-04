import { Channel } from '@johnlindquist/kit/cjs/enum';
import { useAtom } from 'jotai';

import { useHotkeys } from 'react-hotkeys-hook';
import { channelAtom, indexAtom, mouseEnabledAtom } from '../jotai';

import { hotkeysOptions } from './shared';

export default () => {
  const [index, setIndex] = useAtom(indexAtom);
  const [, setMouseEnabled] = useAtom(mouseEnabledAtom);
  const [channel] = useAtom(channelAtom);

  useHotkeys(
    'up',
    (event) => {
      event.preventDefault();
      setMouseEnabled(0);
      setIndex(index - 1);
      channel(Channel.UP);
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
      channel(Channel.DOWN);
    },
    hotkeysOptions,
    [index]
  );
};
