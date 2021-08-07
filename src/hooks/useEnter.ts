import { useAtom } from 'jotai';

import { useHotkeys } from 'react-hotkeys-hook';
import {
  choicesAtom,
  indexAtom,
  inputAtom,
  panelHTMLAtom,
  promptDataAtom,
  submitValueAtom,
} from '../jotai';
import { hotkeysOptions } from './shared';

export default () => {
  const [choices] = useAtom(choicesAtom);
  const [input] = useAtom(inputAtom);
  const [index] = useAtom(indexAtom);
  const [, submit] = useAtom(submitValueAtom);
  const [promptData] = useAtom(promptDataAtom);
  const [panelHTML] = useAtom(panelHTMLAtom);

  useHotkeys(
    'enter,return',
    (event) => {
      event.preventDefault();

      if (promptData?.strict && panelHTML?.length === 0) {
        if (choices.length && choices[index]?.value) {
          submit(choices[index].value);
        }
      } else {
        submit(choices.length ? choices[index].value : input);
      }
    },
    hotkeysOptions,
    [input, choices, index, promptDataAtom, panelHTML]
  );
};
