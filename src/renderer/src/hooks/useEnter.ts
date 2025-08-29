import { UI } from '@johnlindquist/kit/core/enum';
import log from 'electron-log';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import { useCallback, useEffect } from 'react';
import { HotkeyCallback, useHotkeys } from 'react-hotkeys-hook';
import {
  choiceInputsAtom,
  choicesAtom,
  scoredChoicesAtom,
  cmdAtom,
  enterButtonDisabledAtom,
  enterLastPressedAtom,
  enterPressedAtom,
  actionsOverlayOpenAtom,
  focusedChoiceAtom,
  focusedFlagValueAtom,
  hasFocusedChoiceAtom,
  indexAtom,
  inputAtom,
  invalidateChoiceInputsAtom,
  panelHTMLAtom,
  promptDataAtom,
  submitValueAtom,
  toggleSelectedChoiceAtom,
  uiAtom,
} from '../jotai';
import { hotkeysOptions } from './shared';

export default () => {
  const [choices] = useAtom(choicesAtom);
  const scoredChoices = useAtomValue(scoredChoicesAtom);
  const [input] = useAtom(inputAtom);
  const [index, setIndex] = useAtom(indexAtom);
  const [, submit] = useAtom(submitValueAtom);
  const [promptData] = useAtom(promptDataAtom);
  const [panelHTML] = useAtom(panelHTMLAtom);
  const [, setFlag] = useAtom(focusedFlagValueAtom);
  const overlayOpen = useAtomValue(actionsOverlayOpenAtom);
  const [cmd] = useAtom(cmdAtom);
  const [ui] = useAtom(uiAtom);
  const emitEnter = useSetAtom(enterPressedAtom);
  const enterButtonDisabled = useAtomValue(enterButtonDisabledAtom);
  const focusedChoice = useAtomValue(focusedChoiceAtom);
  const hasFocusedChoice = useAtomValue(hasFocusedChoiceAtom);
  const toggleSelectedChoice = useSetAtom(toggleSelectedChoiceAtom);
  const choiceInputs = useAtomValue(choiceInputsAtom);
  const setInvalidateChoiceInputs = useSetAtom(invalidateChoiceInputsAtom);
  const [enterLastPressed] = useAtom(enterLastPressedAtom);

  const handleEnter = useCallback(
    (event: KeyboardEvent | null = null) => {
      if (
        [UI.editor, UI.textarea, UI.drop, UI.splash, UI.term, UI.drop, UI.form, UI.emoji, UI.fields, UI.chat].includes(
          ui,
        ) &&
        !overlayOpen
      ) {
        return;
      }
      event?.preventDefault();

      if (enterButtonDisabled) {
        // Attempt fallback even if disabled: strict + no focus but choices exist
        if (
          promptData?.strict &&
          !overlayOpen &&
          (panelHTML?.length ?? 0) === 0 &&
          choices.length > 0 &&
          !hasFocusedChoice
        ) {
          try {
            const firstIdx = (scoredChoices || []).findIndex(
              (c: any) => c?.item && !c.item.skip && !c.item.info,
            );
            if (firstIdx >= 0) {
              const first = scoredChoices[firstIdx]?.item as any;
              setIndex(firstIdx);
              submit(first?.scriptlet ? first : first?.value);
              return;
            }
          } catch {}
        }
        return;
      }

      if (event?.metaKey) {
        setFlag('cmd');
      }
      if (event?.shiftKey) {
        setFlag('shift');
      }
      if (event?.altKey) {
        setFlag('opt');
      }
      if (event?.ctrlKey) {
        setFlag('ctrl');
      }

      if ([UI.webcam, UI.mic].includes(ui)) {
        emitEnter();
        return;
      }

      if (focusedChoice?.text && !overlayOpen) {
        log.info('submitting focused choice: ', { focusedChoice });
        submit(focusedChoice);
        return;
      }

      if (focusedChoice?.scriptlet && !overlayOpen) {
        // If any of the choice inputs are empty, don't submit
        if (choiceInputs.some((input) => input === '') || choiceInputs?.length !== focusedChoice?.inputs?.length) {
          setInvalidateChoiceInputs(true);
          return;
        }
        submit(choiceInputs);
        return;
      }

      if (promptData?.multiple && !overlayOpen) {
        toggleSelectedChoice(focusedChoice?.id as string);
        return;
      }

      if (promptData?.strict && panelHTML?.length === 0) {
        if (overlayOpen) {
          // Overlay flow handled elsewhere
        } else if (choices.length > 0) {
          if (hasFocusedChoice) {
            submit(focusedChoice?.value);
            return;
          }

          // Fallback: no focused choice yet but we have results.
          // Select the first actionable scored choice and submit it.
          try {
            const firstIdx = (scoredChoices || []).findIndex(
              (c: any) => c?.item && !c.item.skip && !c.item.info,
            );
            if (firstIdx >= 0) {
              const first = scoredChoices[firstIdx]?.item as any;
              setIndex(firstIdx);
              submit(first?.scriptlet ? first : first?.value);
              return;
            }
          } catch {}
        }
      }

      let value;
      if (hasFocusedChoice) {
        // This should cover the flagged scrap scenario
        if (focusedChoice?.scriptlet) {
          value = focusedChoice;
        } else {
          value = focusedChoice?.value;
        }
      } else {
        value = input;
      }

      submit(value);
    },
    [
      submit,
      focusedChoice,
      overlayOpen,
      choiceInputs,
      setInvalidateChoiceInputs,
      toggleSelectedChoice,
      promptData,
      choices,
      hasFocusedChoice,
      input,
      ui,
      enterButtonDisabled,
    ],
  );

  useEffect(() => {
    if (enterLastPressed) {
      handleEnter();
    }
  }, [enterLastPressed]);

  useHotkeys('enter', handleEnter, hotkeysOptions);
};
