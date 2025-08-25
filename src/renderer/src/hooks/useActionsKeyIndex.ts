import { Channel } from '@johnlindquist/kit/core/enum';
import log from 'electron-log';
import { useAtom, useAtomValue } from 'jotai';

import { useHotkeys } from 'react-hotkeys-hook';
import {
  actionsInputFocusAtom,
  channelAtom,
  directionAtom,
  actionsOverlayOpenAtom,
  flagsIndexAtom,
  scoredFlagsAtom,
  flagsHeightAtom,
  actionsItemHeightAtom,
  indexAtom,
  inputFocusAtom,
  mouseEnabledAtom,
  shortcutsAtom,
} from '../jotai';

import { hotkeysOptions } from './shared';
import useListNav from './useListNav';

export default () => {
  const [index] = useAtom(indexAtom);
  const [flagsIndex, setFlagsIndex] = useAtom(flagsIndexAtom);
  const [, setMouseEnabled] = useAtom(mouseEnabledAtom);
  const [channel] = useAtom(channelAtom);
  const [inputFocus] = useAtom(inputFocusAtom);
  const [actionsInputFocus] = useAtom(actionsInputFocusAtom);
  const [shortcuts] = useAtom(shortcutsAtom);
  const [, setDirection] = useAtom(directionAtom);
  const overlayOpen = useAtomValue(actionsOverlayOpenAtom);
  const flags = useAtomValue(scoredFlagsAtom);
  // For page size calculation
  const flagsHeight = useAtomValue(flagsHeightAtom);
  const actionsItemHeight = useAtomValue(actionsItemHeightAtom);

  // Unified navigation for the overlay list
  const nav = useListNav({
    id: 'actions-overlay',
    getCount: () => flags.length,
    getIndex: () => flagsIndex,
    setIndex: (next) => setFlagsIndex(next),
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
      if (!(inputFocus || actionsInputFocus)) {
        return;
      }
      event.preventDefault();
      setMouseEnabled(0);
      setDirection(-1);

      if (overlayOpen) {
        nav.moveUp();
      } else {
        // setIndex(index - 1);
        // channel(Channel.UP);
      }
    },
    hotkeysOptions,
    [index, flagsIndex, channel, inputFocus, actionsInputFocus, shortcuts, overlayOpen, nav],
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

      if (overlayOpen) {
        nav.moveDown();
      } else {
        // setIndex(index + 1);
        // channel(Channel.DOWN);
      }
    },
    hotkeysOptions,
    [index, flagsIndex, channel, inputFocus, actionsInputFocus, shortcuts, overlayOpen, nav],
  );

  useHotkeys(
    'left',
    (_event) => {
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
    (_event) => {
      if (!(inputFocus || actionsInputFocus)) {
        return;
      }
      // event.preventDefault();
      channel(Channel.RIGHT);
    },
    hotkeysOptions,
    [channel, inputFocus, actionsInputFocus, shortcuts],
  );

  // PageUp / PageDown within overlay
  useHotkeys(
    'pageup',
    (event) => {
      if (!(inputFocus || actionsInputFocus)) return;
      if (!overlayOpen) return;
      event.preventDefault();
      setMouseEnabled(0);
      setDirection(-1);
      const page = Math.max(1, Math.floor(flagsHeight / Math.max(1, actionsItemHeight)));
      nav.pageUp(page);
    },
    hotkeysOptions,
    [inputFocus, actionsInputFocus, overlayOpen, flagsHeight, actionsItemHeight, nav],
  );

  useHotkeys(
    'pagedown',
    (event) => {
      if (!(inputFocus || actionsInputFocus)) return;
      if (!overlayOpen) return;
      event.preventDefault();
      setMouseEnabled(0);
      setDirection(1);
      const page = Math.max(1, Math.floor(flagsHeight / Math.max(1, actionsItemHeight)));
      nav.pageDown(page);
    },
    hotkeysOptions,
    [inputFocus, actionsInputFocus, overlayOpen, flagsHeight, actionsItemHeight, nav],
  );
};
