import { useAtom } from 'jotai';
import { debounce } from 'lodash';
import { useHotkeys } from 'react-hotkeys-hook';
import { cmdAtom } from '../jotai';
import { hotkeysOptions } from './shared';

export default (
  fn: (direction: 'up' | 'down' | 'left' | 'right') => void,
  deps: any[]
) => {
  const [cmd] = useAtom(cmdAtom);
  useHotkeys(
    `up,down,left,right,${cmd}+up,${cmd}+down`,
    debounce(
      (event: KeyboardEvent, handler) => {
        event.preventDefault();
        fn(handler.key);
      },
      100,
      { leading: true, maxWait: 200 }
    ),
    hotkeysOptions,
    [fn, ...deps, cmd]
  );
};
