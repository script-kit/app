import { useAtom } from 'jotai';
import { useHotkeys } from 'react-hotkeys-hook';
import {
  _choices,
  cmdAtom,
  _flag,
  _index,
  inputAtom,
  panelHTMLAtom,
  promptDataAtom,
  submitValueAtom,
} from '../jotai';
import { hotkeysOptions } from './shared';

export default () => {
  const [choices] = useAtom(_choices);
  const [input] = useAtom(inputAtom);
  const [index] = useAtom(_index);
  const [, submit] = useAtom(submitValueAtom);
  const [promptData] = useAtom(promptDataAtom);
  const [panelHTML] = useAtom(panelHTMLAtom);
  const [, setFlag] = useAtom(_flag);
  const [cmd] = useAtom(cmdAtom);

  useHotkeys(
    `enter,${cmd}+enter,shift+enter,option+enter`,
    (event) => {
      event.preventDefault();
      if (event.metaKey) setFlag(`cmd`);
      if (event.shiftKey) setFlag(`shift`);
      if (event.altKey) setFlag(`opt`);
      if (event.ctrlKey) setFlag(`ctrl`);

      if (promptData?.strict && panelHTML?.length === 0) {
        if (choices.length && typeof choices[index]?.value !== 'undefined') {
          submit(choices[index].value);
        }
      } else {
        submit(choices.length ? choices[index].value : input);
      }
    },
    hotkeysOptions,
    [input, choices, index, promptDataAtom, panelHTML]
  );

  // useHotkeys(
  //   'f12',
  //   () => {
  //     console.log(`🔥f20`);
  //     setFlag('end');
  //     submit(Value.NoValue);
  //   },
  //   hotkeysOptions,
  //   []
  // );
};
