const { ipcRenderer } = window.electron;
import { useAtom } from 'jotai';

import { useHotkeys } from 'react-hotkeys-hook';
import { appStateAtom, choicesAtom, cmdAtom, indexAtom } from '../jotai';
import { hotkeysOptions } from './shared';
import { AppChannel } from '../../../shared/enums';

export default () => {
  const [choices] = useAtom(choicesAtom);
  const [index] = useAtom(indexAtom);
  const [cmd] = useAtom(cmdAtom);
  const [state] = useAtom(appStateAtom);
  useHotkeys(
    `${cmd}+o`,
    (event) => {
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
