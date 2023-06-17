import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import { useHotkeys } from 'react-hotkeys-hook';
import { UI } from '@johnlindquist/kit/cjs/enum';
import {
  _choices,
  cmdAtom,
  _flag,
  indexAtom,
  inputAtom,
  panelHTMLAtom,
  promptDataAtom,
  submitValueAtom,
  uiAtom,
  enterPressedAtom,
  enterButtonDisabledAtom,
} from '../jotai';
import { hotkeysOptions } from './shared';

export default () => {
  const [choices] = useAtom(_choices);
  const [input] = useAtom(inputAtom);
  const [index] = useAtom(indexAtom);
  const [, submit] = useAtom(submitValueAtom);
  const [promptData] = useAtom(promptDataAtom);
  const [panelHTML] = useAtom(panelHTMLAtom);
  const [, setFlag] = useAtom(_flag);
  const [cmd] = useAtom(cmdAtom);
  const [ui] = useAtom(uiAtom);
  const emitEnter = useSetAtom(enterPressedAtom);
  const enterButtonDisabled = useAtomValue(enterButtonDisabledAtom);

  useHotkeys(
    `enter`,
    (event) => {
      if (
        [
          UI.editor,
          UI.textarea,
          UI.drop,
          UI.splash,
          UI.term,
          UI.drop,
          UI.form,
          UI.emoji,
          UI.fields,
          UI.chat,
        ].includes(ui)
      ) {
        return;
      }
      event.preventDefault();

      if (enterButtonDisabled) return;

      if (event.metaKey) setFlag(`cmd`);
      if (event.shiftKey) setFlag(`shift`);
      if (event.altKey) setFlag(`opt`);
      if (event.ctrlKey) setFlag(`ctrl`);

      if ([UI.webcam, UI.mic, UI.speech].includes(ui)) {
        emitEnter();
        return;
      }

      if (promptData?.strict && panelHTML?.length === 0) {
        if (choices.length && typeof choices[index]?.value !== 'undefined') {
          submit(choices[index].value);
        }
      } else {
        submit(choices.length ? choices[index].value : input);
      }
    },
    hotkeysOptions,
    [input, choices, index, promptDataAtom, panelHTML, ui, enterButtonDisabled]
  );
};
