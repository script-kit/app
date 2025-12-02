import { Channel } from '@johnlindquist/kit/core/enum';
import { useAtom, useAtomValue } from 'jotai';

import { useHotkeys } from 'react-hotkeys-hook';
import {
  actionsOverlayOpenAtom,
  channelAtom,
  choicesHeightAtom,
  directionAtom,
  flagsIndexAtom,
  gridReadyAtom,
  indexAtom,
  inputFocusAtom,
  itemHeightAtom,
  mouseEnabledAtom,
  scoredChoicesAtom,
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

  // Check if shortcuts exist for left/right - if so, let useShortcuts.ts handle them
  // to avoid double-triggering (Channel.LEFT/RIGHT + Channel.SHORTCUT)
  const hasLeftShortcut = shortcuts.some((s) => s?.key === 'left');
  const hasRightShortcut = shortcuts.some((s) => s?.key === 'right');

  useHotkeys(
    'left',
    (event) => {
      if (!inputFocus) {
        return;
      }
      if (gridReady) {
        return;
      }
      // If there's a 'left' shortcut registered, let useShortcuts.ts handle it
      // to avoid double-triggering both Channel.LEFT and Channel.SHORTCUT
      if (hasLeftShortcut) {
        return;
      }
      // Check cursor position - only send channel if at start of input
      const target = event.target as HTMLInputElement;
      if (target?.tagName === 'INPUT') {
        const { selectionStart, selectionEnd } = target;
        const cursorAtStart = selectionStart === 0 && selectionEnd === 0;
        if (!cursorAtStart) {
          // Allow cursor movement within input text
          return;
        }
      }
      // event.preventDefault();
      channel(Channel.LEFT);
    },
    hotkeysOptions,
    [channel, inputFocus, shortcuts, hasLeftShortcut, gridReady],
  );

  useHotkeys(
    'right',
    (event) => {
      if (!inputFocus) {
        return;
      }
      if (gridReady) {
        return;
      }
      // If there's a 'right' shortcut registered, let useShortcuts.ts handle it
      // to avoid double-triggering both Channel.RIGHT and Channel.SHORTCUT
      if (hasRightShortcut) {
        return;
      }
      // Check cursor position - only send channel if at end of input
      const target = event.target as HTMLInputElement;
      if (target?.tagName === 'INPUT') {
        const { selectionStart, selectionEnd, value } = target;
        const cursorAtEnd = selectionStart === value.length && selectionEnd === value.length;
        if (!cursorAtEnd) {
          // Allow cursor movement within input text
          return;
        }
      }
      // event.preventDefault();
      channel(Channel.RIGHT);
    },
    hotkeysOptions,
    [channel, inputFocus, shortcuts, hasRightShortcut, gridReady],
  );
};
