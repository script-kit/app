import { ipcRenderer } from 'electron';
import { useAtom } from 'jotai';

import { useHotkeys } from 'react-hotkeys-hook';
import { appStateAtom, _choices, cmdAtom, _index } from '../jotai';
import { hotkeysOptions } from './shared';
import { AppChannel } from '../enums';

export default () => {
  const [choices] = useAtom(_choices);
  const [index] = useAtom(_index);
  const [cmd] = useAtom(cmdAtom);
  const [state] = useAtom(appStateAtom);
  useHotkeys(
    `${cmd}+o`,
    (event) => {
      console.log(`${cmd}+o`);
      event.preventDefault();
      // if (isMainScript) return;

      const filePath = (choices?.[index] as any)?.filePath;
      if (filePath) {
        ipcRenderer.send(AppChannel.OPEN_FILE, state);
      } else {
        ipcRenderer.send(AppChannel.OPEN_SCRIPT, state);
      }
    },
    hotkeysOptions,
    [choices, state]
  );
};
