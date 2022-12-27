import { ipcRenderer } from 'electron';
import { useAtom } from 'jotai';
import { AppChannel } from '@johnlindquist/kit/core/enum';

import { useHotkeys } from 'react-hotkeys-hook';
import { appStateAtom, cmdAtom } from '../jotai';

import { hotkeysOptions } from './hooksConfig';

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
