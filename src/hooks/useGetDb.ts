import { ipcRenderer } from 'electron';
import { useAtom } from 'jotai';
import { basename, resolve } from 'path';

import { Channel } from '@johnlindquist/kit/cjs/enum';
import { useHotkeys } from 'react-hotkeys-hook';
import { choicesAtom, indexAtom, scriptAtom } from '../jotai';

import { hotkeysOptions } from './shared';

export default () => {
  const [choices] = useAtom(choicesAtom);
  const [index] = useAtom(indexAtom);
  const [script] = useAtom(scriptAtom);
  useHotkeys(
    'ctrl+d,cmd+d',
    (event) => {
      event.preventDefault();

      const filePath = (choices?.[index] as any)?.filePath || script?.filePath;
      const dbPath = resolve(
        filePath,
        '..',
        '..',
        'db',
        `_${basename(filePath).replace(/js$/, 'json')}`
      );
      ipcRenderer.send(Channel.OPEN_FILE, dbPath);
    },
    hotkeysOptions,
    [choices, index, script]
  );
};
