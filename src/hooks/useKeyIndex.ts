import { Channel } from '@johnlindquist/kit/cjs/enum';
import { useAtom } from 'jotai';

import { useHotkeys } from 'react-hotkeys-hook';
import {
  channelAtom,
  _index,
  mouseEnabledAtom,
  inputFocusAtom,
} from '../jotai';

import { hotkeysOptions } from './shared';

export default () => {
  const [index, setIndex] = useAtom(_index);
  const [, setMouseEnabled] = useAtom(mouseEnabledAtom);
  const [channel] = useAtom(channelAtom);
  const [inputFocus] = useAtom(inputFocusAtom);

  useHotkeys(
    'up',
    (event) => {
      if (!inputFocus) return;
      event.preventDefault();
      setMouseEnabled(0);
      setIndex(index - 1);
      channel(Channel.UP);
    },
    hotkeysOptions,
    [index, channel, inputFocus]
  );

  useHotkeys(
    'down',
    (event) => {
      if (!inputFocus) return;
      event.preventDefault();
      setMouseEnabled(0);
      setIndex(index + 1);
      channel(Channel.DOWN);
    },
    hotkeysOptions,
    [index, channel, inputFocus]
  );

  useHotkeys(
    'left',
    (event) => {
      if (!inputFocus) return;
      // event.preventDefault();
      channel(Channel.LEFT);
    },
    hotkeysOptions,
    [channel, inputFocus]
  );

  useHotkeys(
    'right',
    (event) => {
      if (!inputFocus) return;
      // event.preventDefault();
      channel(Channel.RIGHT);
    },
    hotkeysOptions,
    [channel, inputFocus]
  );
};
