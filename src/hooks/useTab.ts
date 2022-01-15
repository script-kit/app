import { useAtom } from 'jotai';
import { Channel } from '@johnlindquist/kit/cjs/enum';

import { useHotkeys } from 'react-hotkeys-hook';
import { channelAtom, tabIndexAtom, _tabs } from '../jotai';
import { hotkeysOptions } from './shared';

export default () => {
  const [tabIndex, setTabIndex] = useAtom(tabIndexAtom);
  const [tabs] = useAtom(_tabs);
  const [channel] = useAtom(channelAtom);

  useHotkeys(
    'tab,shift+tab',
    (event) => {
      event.preventDefault();
      if (tabs?.length) {
        const maxTab = tabs.length;
        const clampTabIndex = (tabIndex + (event.shiftKey ? -1 : 1)) % maxTab;
        const nextIndex = clampTabIndex < 0 ? maxTab - 1 : clampTabIndex;
        setTabIndex(nextIndex);
      }

      channel(Channel.TAB);
    },
    hotkeysOptions,
    [tabIndex, tabs, channel]
  );
};
