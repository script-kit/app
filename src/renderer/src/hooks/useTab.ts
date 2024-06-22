import { Channel } from '@johnlindquist/kit/core/enum';
import { useAtom, useAtomValue } from 'jotai';

import { useHotkeys } from 'react-hotkeys-hook';
import { channelAtom, focusedChoiceAtom, inputAtom, isMainScriptAtom, tabIndexAtom, tabsAtom } from '../jotai';
import { hotkeysOptions } from './shared';

export default () => {
  const [tabIndex, setTabIndex] = useAtom(tabIndexAtom);
  const [tabs] = useAtom(tabsAtom);
  const [channel] = useAtom(channelAtom);
  const [inputValue, setInput] = useAtom(inputAtom);
  const isMainScript = useAtom(isMainScriptAtom);
  const focusedChoice = useAtomValue(focusedChoiceAtom);

  useHotkeys(
    'tab,shift+tab',
    (event) => {
      if (focusedChoice?.inputs?.length) {
        return;
      }
      event.preventDefault();
      if (tabs?.length) {
        let ti = 0;
        let tab = null;

        if (inputValue?.length > 0) {
          tab = tabs.find((t) => t.toLowerCase().startsWith(inputValue?.toLowerCase()));
        }

        if (tab) {
          ti = tabs.indexOf(tab);
          setInput('');
        } else {
          const maxTab = tabs.length;
          const clampTabIndex = (tabIndex + (event.shiftKey ? -1 : 1)) % maxTab;
          ti = clampTabIndex < 0 ? maxTab - 1 : clampTabIndex;
        }

        setTabIndex(ti);
      }

      channel(Channel.TAB);
    },
    hotkeysOptions,
    [tabIndex, tabs, channel, inputValue, isMainScript],
  );
};
