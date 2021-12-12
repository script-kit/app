import { ipcRenderer } from 'electron';
import { useAtom } from 'jotai';

import { Channel } from '@johnlindquist/kit/cjs/enum';
import { useHotkeys } from 'react-hotkeys-hook';
import { choicesAtom, cmdAtom, indexAtom, scriptAtom } from '../jotai';
import { hotkeysOptions } from './shared';

export default () => {
  const [choices] = useAtom(choicesAtom);
  const [index] = useAtom(indexAtom);
  const [script] = useAtom(scriptAtom);
  const [cmd] = useAtom(cmdAtom);
  useHotkeys(
    `${cmd}+o`,
    (event) => {
      event.preventDefault();

      const filePath = (choices?.[index] as any)?.filePath;
      if (filePath) {
        ipcRenderer.send(Channel.OPEN_FILE, filePath);
      } else {
        ipcRenderer.send(Channel.OPEN_SCRIPT, script);
      }
    },
    hotkeysOptions,
    [choices, index, script]
  );
};
