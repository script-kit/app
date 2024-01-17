const { ipcRenderer } = window.electron;
import { useAtom } from 'jotai';

import { useHotkeys } from 'react-hotkeys-hook';
import { appStateAtom, cmdAtom } from '../jotai';

import { hotkeysOptions } from './shared';
import { AppChannel } from '../enums';

export default () => {
  const [cmd] = useAtom(cmdAtom);
  const [state] = useAtom(appStateAtom);
  useHotkeys(
    `${cmd}+d`,
    (event) => {
      event.preventDefault();

      ipcRenderer.send(AppChannel.OPEN_SCRIPT_DB, state);
    },
    hotkeysOptions,
    [state]
  );
};
