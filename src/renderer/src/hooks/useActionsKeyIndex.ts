import { Channel } from '@johnlindquist/kit/core/enum';
import log from 'electron-log';
import { useAtom, useAtomValue } from 'jotai';

import { useHotkeys } from 'react-hotkeys-hook';
import {
  actionsInputFocusAtom,
  channelAtom,
  directionAtom,
  flaggedChoiceValueAtom,
  flagsIndexAtom,
  indexAtom,
  inputFocusAtom,
  mouseEnabledAtom,
  shortcutsAtom,
} from '../jotai';

import { hotkeysOptions } from './shared';

export default () => {
  const [index, setIndex] = useAtom(indexAtom);
  const [flagsIndex, setFlagsIndex] = useAtom(flagsIndexAtom);
  const [, setMouseEnabled] = useAtom(mouseEnabledAtom);
  const [channel] = useAtom(channelAtom);
  const [inputFocus] = useAtom(inputFocusAtom);
  const [actionsInputFocus] = useAtom(actionsInputFocusAtom);
  const [shortcuts] = useAtom(shortcutsAtom);
  const [, setDirection] = useAtom(directionAtom);
  const flagValue = useAtomValue(flaggedChoiceValueAtom);

  // useEffect(() => {
  //   const list = document.getElementById('list');
  //   if (!list) return;

  //   listRef.current = list;
  // }, []);

  useHotkeys(
    'up',
    (event) => {
      if (!(inputFocus || actionsInputFocus)) {
        return;
      }
      event.preventDefault();
      setMouseEnabled(0);
      setDirection(-1);

      if (flagValue) {
        setFlagsIndex(flagsIndex - 1);
      } else {
        // setIndex(index - 1);
        // channel(Channel.UP);
      }
    },
    hotkeysOptions,
    [index, flagsIndex, channel, inputFocus, actionsInputFocus, shortcuts, flagValue],
  );

  useHotkeys(
    'down',
    (event) => {
      if (!(inputFocus || actionsInputFocus)) {
        return;
      }
      event.preventDefault();
      setMouseEnabled(0);
      setDirection(1);

      if (flagValue) {
        setFlagsIndex(flagsIndex + 1);
      } else {
        // setIndex(index + 1);
        // channel(Channel.DOWN);
      }
    },
    hotkeysOptions,
    [index, flagsIndex, channel, inputFocus, actionsInputFocus, shortcuts, flagValue],
  );

  useHotkeys(
    'left',
    (event) => {
      if (!(inputFocus || actionsInputFocus)) {
        return;
      }
      // event.preventDefault();
      channel(Channel.LEFT);
    },
    hotkeysOptions,
    [channel, inputFocus, actionsInputFocus, shortcuts],
  );

  useHotkeys(
    'right',
    (event) => {
      if (!(inputFocus || actionsInputFocus)) {
        return;
      }
      // event.preventDefault();
      channel(Channel.RIGHT);
    },
    hotkeysOptions,
    [channel, inputFocus, actionsInputFocus, shortcuts],
  );
};
