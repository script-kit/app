import { Channel } from '@johnlindquist/kit/core/enum';
import { useAtom, useAtomValue } from 'jotai';

import { useHotkeys } from 'react-hotkeys-hook';
import {
  channelAtom,
  directionAtom,
  actionsOverlayOpenAtom,
  flagsIndexAtom,
  choicesHeightAtom,
  itemHeightAtom,
  scoredChoicesAtom,
  gridReadyAtom,
  indexAtom,
  inputFocusAtom,
  mouseEnabledAtom,
  shortcutsAtom,
} from '../jotai';

import { hotkeysOptions } from './shared';
import useListNav from './useListNav';

export default () => {
  const [index, setIndex] = useAtom(indexAtom);
  const [flagsIndex] = useAtom(flagsIndexAtom);
  const [, setMouseEnabled] = useAtom(mouseEnabledAtom);
  const [channel] = useAtom(channelAtom);
  const [inputFocus] = useAtom(inputFocusAtom);
  const [shortcuts] = useAtom(shortcutsAtom);
  const [, setDirection] = useAtom(directionAtom);
  const overlayOpen = useAtomValue(actionsOverlayOpenAtom);
  const gridReady = useAtomValue(gridReadyAtom);
  const choices = useAtomValue(scoredChoicesAtom);
  const listHeight = useAtomValue(choicesHeightAtom);
  const rowHeight = useAtomValue(itemHeightAtom);

  // Unified navigation for choices list (non-grid)
  const nav = useListNav({
    id: 'choices-list',
    getCount: () => choices.length,
    getIndex: () => index,
    setIndex: (next) => setIndex(next),
    loop: true,
  });

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
        nav.moveUp();
        channel(Channel.UP);
      }
    },
    hotkeysOptions,
    [index, flagsIndex, channel, inputFocus, shortcuts, overlayOpen, gridReady, nav],
  );

  // PageUp / PageDown for list
  useHotkeys(
    'pageup',
    (event) => {
      if (!inputFocus) return;
      if (gridReady) return;
      event.preventDefault();
      setMouseEnabled(0);
      setDirection(-1);
      if (!overlayOpen) {
        const page = Math.max(1, Math.floor(listHeight / Math.max(1, rowHeight)));
        nav.pageUp(page);
        channel(Channel.UP);
      }
    },
    hotkeysOptions,
    [inputFocus, gridReady, overlayOpen, listHeight, rowHeight, nav, channel],
  );

  useHotkeys(
    'pagedown',
    (event) => {
      if (!inputFocus) return;
      if (gridReady) return;
      event.preventDefault();
      setMouseEnabled(0);
      setDirection(1);
      if (!overlayOpen) {
        const page = Math.max(1, Math.floor(listHeight / Math.max(1, rowHeight)));
        nav.pageDown(page);
        channel(Channel.DOWN);
      }
    },
    hotkeysOptions,
    [inputFocus, gridReady, overlayOpen, listHeight, rowHeight, nav, channel],
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
        nav.moveDown();
        channel(Channel.DOWN);
      }
    },
    hotkeysOptions,
    [index, flagsIndex, channel, inputFocus, shortcuts, overlayOpen, gridReady, nav],
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
