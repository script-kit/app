import { useAtom } from 'jotai';
import { Channel } from '@johnlindquist/kit/cjs/enum';

import { useHotkeys } from 'react-hotkeys-hook';
import { channelAtom, inputAtom, tabIndexAtom, _tabs } from '../jotai';
import { hotkeysOptions } from './shared';

export default () => {
  const [tabIndex, setTabIndex] = useAtom(tabIndexAtom);
  const [tabs] = useAtom(_tabs);
  const [channel] = useAtom(channelAtom);
  const [inputValue, setInput] = useAtom(inputAtom);

  useHotkeys(
    'tab,shift+tab',
    (event) => {
      event.preventDefault();
      if (tabs?.length) {
        let ti = 0;
        let tab = null;

        if (inputValue?.length > 0) {
          tab = tabs.find((t) =>
            t.toLowerCase().startsWith(inputValue?.toLowerCase())
          );
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
    [tabIndex, tabs, channel, inputValue]
  );
};
