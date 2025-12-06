import { UI } from '@johnlindquist/kit/core/enum';
import log from 'electron-log';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import { useCallback, useEffect } from 'react';
import { HotkeyCallback, useHotkeys } from 'react-hotkeys-hook';
import {
  actionsOverlayOpenAtom,
  choiceInputsAtom,
  choicesAtom,
  cmdAtom,
  enterButtonDisabledAtom,
  enterLastPressedAtom,
  enterPressedAtom,
  focusedChoiceAtom,
  focusedFlagValueAtom,
  hasFocusedChoiceAtom,
  indexAtom,
  inputAtom,
  invalidateChoiceInputsAtom,
  panelHTMLAtom,
  promptDataAtom,
  scoredChoicesAtom,
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
      // FIX: Derive actualChoice from scoredChoices[index] to avoid race condition
      // where focusedChoiceAtom can be out of sync with indexAtom
      const actualChoice = index >= 0 && index < scoredChoices.length
        ? scoredChoices[index]?.item
        : focusedChoice;

      // DEBUG: Log what's being submitted to diagnose selection mismatch
      console.log('🔑 [useEnter] handleEnter called', JSON.stringify({
        focusedChoiceName: focusedChoice?.name?.substring(0, 40),
        actualChoiceName: actualChoice?.name?.substring(0, 40),
        focusedChoiceId: focusedChoice?.id?.substring(0, 20),
        actualChoiceId: actualChoice?.id?.substring(0, 20),
        index,
        scoredChoicesLength: scoredChoices.length,
        mismatch: focusedChoice?.id !== actualChoice?.id,
        hasFocusedChoice,
        overlayOpen,
        ui,
      }));

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

      if (actualChoice?.text && !overlayOpen) {
        log.info('submitting focused choice: ', { actualChoice });
        submit(actualChoice);
        return;
      }

      if (actualChoice?.scriptlet && !overlayOpen) {
        // If any of the choice inputs are empty, don't submit
        if (choiceInputs.some((input) => input === '') || choiceInputs?.length !== actualChoice?.inputs?.length) {
          setInvalidateChoiceInputs(true);
          return;
        }
        submit(choiceInputs);
        return;
      }

      if (promptData?.multiple && !overlayOpen) {
        toggleSelectedChoice(actualChoice?.id as string);
        return;
      }

      if (promptData?.strict && panelHTML?.length === 0) {
        if (overlayOpen) {
          // Overlay flow handled elsewhere
        } else if (choices.length > 0 && actualChoice) {
          // FIX: Use actualChoice derived from scoredChoices[index] to avoid race condition
          submit(actualChoice?.value);
          return;
        }
      }

      let value;
      if (actualChoice && actualChoice !== focusedChoice) {
        // FIX: Use actualChoice when there's a mismatch (race condition detected)
        if (actualChoice?.scriptlet) {
          value = actualChoice;
        } else {
          value = actualChoice?.value;
        }
      } else if (hasFocusedChoice) {
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
      scoredChoices,
      index,
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
