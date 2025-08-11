/* eslint-disable no-restricted-syntax */
/* eslint-disable react-hooks/rules-of-hooks */
import { useAtom } from 'jotai';

import { useHotkeys } from 'react-hotkeys-hook';
import { cmdAtom, submitValueAtom } from '../jotai';

import { hotkeysOptions } from './shared';

export default (value: any) => {
  const [, submit] = useAtom(submitValueAtom);
  const [cmd] = useAtom(cmdAtom);

  useHotkeys(
    `${cmd}+s`,
    (event) => {
      event.preventDefault();
      submit(value);
    },
    hotkeysOptions,
    [value],
  );
};
