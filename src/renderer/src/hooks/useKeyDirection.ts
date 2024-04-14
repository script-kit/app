import { useAtom } from 'jotai';
import { debounce } from 'lodash-es';
import { useHotkeys } from 'react-hotkeys-hook';
import { cmdAtom, inputFocusAtom } from '../jotai';
import { hotkeysOptions } from './shared';
import { HotkeysEvent } from 'react-hotkeys-hook/dist/types';

export type Direction = 'up' | 'down' | 'left' | 'right';

export default (
  fn: (direction: Direction) => void,
  deps: any[]
) => {
  const [cmd] = useAtom(cmdAtom);
  const [inputFocus] = useAtom(inputFocusAtom);

  useHotkeys(
    `up,down,${cmd}+up,${cmd}+down`,
    debounce(
      (event: KeyboardEvent, handler:HotkeysEvent) => {
        if (inputFocus) {
          event.preventDefault();
          if(handler.keys){
            fn(handler?.keys[0] as Direction);
          }
        }
      },
      100,
      { leading: true, maxWait: 200 }
    ),
    hotkeysOptions,
    [fn, ...deps, cmd, inputFocus]
  );
};