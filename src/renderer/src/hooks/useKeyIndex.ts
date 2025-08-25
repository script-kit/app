import { Channel } from '@johnlindquist/kit/core/enum';
import { useAtom, useAtomValue } from 'jotai';

import { useHotkeys } from 'react-hotkeys-hook';
import {
  channelAtom,
  directionAtom,
  actionsOverlayOpenAtom,
  flagsIndexAtom,
  gridReadyAtom,
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
  const [shortcuts] = useAtom(shortcutsAtom);
  const [, setDirection] = useAtom(directionAtom);
  const overlayOpen = useAtomValue(actionsOverlayOpenAtom);
  const gridReady = useAtomValue(gridReadyAtom);

  // useEffect(() => {
  //   const list = document.getElementById('list');
  //   if (!list) return;

  //   listRef.current = list;
  // }, []);

  useHotkeys(
    'up',
    (event) => {
      if (!inputFocus) {
        return;
      }
      if (gridReady) {
        return;
      }

      event.preventDefault();
      setMouseEnabled(0);
      setDirection(-1);

      if (overlayOpen) {
        // setFlagsIndex(flagsIndex - 1);
      } else {
        setIndex(index - 1);
        channel(Channel.UP);
      }
    },
    hotkeysOptions,
    [index, flagsIndex, channel, inputFocus, shortcuts, overlayOpen, gridReady],
  );

  useHotkeys(
    'down',
    (event) => {
      if (!inputFocus) {
        return;
      }
      if (gridReady) {
        return;
      }
      event.preventDefault();
      setMouseEnabled(0);
      setDirection(1);

      if (overlayOpen) {
        // setFlagsIndex(flagsIndex + 1);
      } else {
        setIndex(index + 1);
        channel(Channel.DOWN);
      }
    },
    hotkeysOptions,
    [index, flagsIndex, channel, inputFocus, shortcuts, overlayOpen, gridReady],
  );

  useHotkeys(
    'left',
    (_event) => {
      if (!inputFocus) {
        return;
      }
      if (gridReady) {
        return;
      }
      // event.preventDefault();
      channel(Channel.LEFT);
    },
    hotkeysOptions,
    [channel, inputFocus, shortcuts],
  );

  useHotkeys(
    'right',
    (_event) => {
      if (!inputFocus) {
        return;
      }
      if (gridReady) {
        return;
      }
      // event.preventDefault();
      channel(Channel.RIGHT);
    },
    hotkeysOptions,
    [channel, inputFocus, shortcuts],
  );
};
