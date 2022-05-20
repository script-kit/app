import { useAtom } from 'jotai';
import { debounce } from 'lodash';
import { useHotkeys } from 'react-hotkeys-hook';
import { cmdAtom, inputFocusAtom } from '../jotai';
import { hotkeysOptions } from './shared';

export default (
  fn: (direction: 'up' | 'down' | 'left' | 'right') => void,
  deps: any[]
) => {
  const [cmd] = useAtom(cmdAtom);
  const [inputFocus] = useAtom(inputFocusAtom);

  // useHotkeys(
  //   `up,down,left,right`,
  //   debounce(
  //     (event: KeyboardEvent, handler) => {
  //       console.log(`direction`, { inputFocus });
  //       if (!inputFocus) {
  //         event.preventDefault();
  //         fn(handler.key);
  //       }
  //     },
  //     100,
  //     { leading: true, maxWait: 200 }
  //   ),
  //   hotkeysOptions,
  //   [fn, ...deps, cmd, inputFocus]
  // );

  useHotkeys(
    `up,down,${cmd}+up,${cmd}+down`,
    debounce(
      (event: KeyboardEvent, handler) => {
        if (inputFocus) {
          event.preventDefault();
          fn(handler.key);
        }
      },
      100,
      { leading: true, maxWait: 200 }
    ),
    hotkeysOptions,
    [fn, ...deps, cmd, inputFocus]
  );
};
