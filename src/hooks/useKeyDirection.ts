import { debounce } from 'lodash';
import { useHotkeys } from 'react-hotkeys-hook';
import { hotkeysOptions } from './shared';

export default (
  fn: (direction: 'up' | 'down' | 'left' | 'right') => void,
  deps: any[]
) => {
  useHotkeys(
    'up,down,left,right',
    debounce(
      (event, handler) => {
        event.preventDefault();
        fn(handler.key);
      },
      100,
      { leading: true, maxWait: 200 }
    ),
    hotkeysOptions,
    [fn, deps]
  );
};
