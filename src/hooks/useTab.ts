import { useAtom } from 'jotai';

import { useHotkeys } from 'react-hotkeys-hook';
import { tabIndexAtom, tabsAtom } from '../jotai';
import { hotkeysOptions } from './shared';

export default () => {
  const [tabIndex, setTabIndex] = useAtom(tabIndexAtom);
  const [tabs] = useAtom(tabsAtom);

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
    },
    hotkeysOptions,
    [tabIndex, tabs]
  );
};
