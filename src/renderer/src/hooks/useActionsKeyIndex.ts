import { Channel } from '@johnlindquist/kit/core/enum';
import log from 'electron-log';
import { useAtom, useAtomValue } from 'jotai';

import { useHotkeys } from 'react-hotkeys-hook';
import {
  actionsInputFocusAtom,
  actionsItemHeightAtom,
  actionsOverlayOpenAtom,
  channelAtom,
  directionAtom,
  flagsHeightAtom,
  flagsIndexAtom,
  indexAtom,
  inputFocusAtom,
  mouseEnabledAtom,
  scoredFlagsAtom,
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

  // Check if shortcuts exist for left/right - if so, let useShortcuts.ts handle them
  // to avoid double-triggering (Channel.LEFT/RIGHT + Channel.SHORTCUT)
  const hasLeftShortcut = shortcuts.some((s) => s?.key === 'left');
  const hasRightShortcut = shortcuts.some((s) => s?.key === 'right');

  useHotkeys(
    'left',
    (event) => {
      if (!(inputFocus || actionsInputFocus)) {
        return;
      }
      // If there's a 'left' shortcut registered, let useShortcuts.ts handle it
      if (hasLeftShortcut) {
        return;
      }
      // Check cursor position - only send channel if at start of input
      const target = event.target as HTMLInputElement;
      if (target?.tagName === 'INPUT') {
        const { selectionStart, selectionEnd } = target;
        const cursorAtStart = selectionStart === 0 && selectionEnd === 0;
        if (!cursorAtStart) {
          return;
        }
      }
      // event.preventDefault();
      channel(Channel.LEFT);
    },
    hotkeysOptions,
    [channel, inputFocus, actionsInputFocus, shortcuts, hasLeftShortcut],
  );

  useHotkeys(
    'right',
    (event) => {
      if (!(inputFocus || actionsInputFocus)) {
        return;
      }
      // If there's a 'right' shortcut registered, let useShortcuts.ts handle it
      if (hasRightShortcut) {
        return;
      }
      // Check cursor position - only send channel if at end of input
      const target = event.target as HTMLInputElement;
      if (target?.tagName === 'INPUT') {
        const { selectionStart, selectionEnd, value } = target;
        const cursorAtEnd = selectionStart === value.length && selectionEnd === value.length;
        if (!cursorAtEnd) {
          return;
        }
      }
      // event.preventDefault();
      channel(Channel.RIGHT);
    },
    hotkeysOptions,
    [channel, inputFocus, actionsInputFocus, shortcuts, hasRightShortcut],
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
