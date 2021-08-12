import { ipcRenderer } from 'electron';
import { useAtom } from 'jotai';
import { partition } from 'lodash';

import { Mode } from 'kit-bridge/cjs/enum';
import { Choice } from 'kit-bridge/cjs/type';
import { useEffect } from 'react';
import {
  choicesAtom,
  inputAtom,
  mainHeightAtom,
  modeAtom,
  pidAtom,
  submittedAtom,
  unfilteredChoicesAtom,
} from '../jotai';

import { highlightChoiceName } from './highlight';

export default () => {
  const [inputValue] = useAtom(inputAtom);
  const [submitted] = useAtom(submittedAtom);
  const [unfilteredChoices] = useAtom(unfilteredChoicesAtom);
  const [, setFilteredChoices] = useAtom(choicesAtom);
  const [mode] = useAtom(modeAtom);
  const [pid] = useAtom(pidAtom);
  const [, setMainHeight] = useAtom(mainHeightAtom);

  useEffect(() => {
    if (submitted) return;
    try {
      if (inputValue === '') {
        setFilteredChoices(unfilteredChoices);
        return;
      }
      if (mode === (Mode.GENERATE || Mode.MANUAL)) {
        setFilteredChoices(unfilteredChoices);
        return;
      }
      if (!unfilteredChoices?.length) {
        setFilteredChoices([]);
        return;
      }

      if (submitted) return;

      const input = inputValue?.toLowerCase() || '';

      const startExactFilter = (choice: Choice) => {
        return (choice.name as string)?.toLowerCase().startsWith(input);
      };

      const startEachWordFilter = (choice: Choice) => {
        let wordIndex = 0;
        let wordLetterIndex = 0;
        const words = (choice.name as string)?.toLowerCase().match(/\w+\W*/g);
        if (!words) return false;
        const inputLetters: string[] = input.split('');

        const checkNextLetter = (inputLetter: string): boolean => {
          const word = words[wordIndex];
          const letter = word[wordLetterIndex];

          if (inputLetter === letter) {
            wordLetterIndex += 1;
            return true;
          }

          return false;
        };

        const checkNextWord = (inputLetter: string): boolean => {
          wordLetterIndex = 0;
          wordIndex += 1;

          const word = words[wordIndex];
          if (!word) return false;
          const letter = word[wordLetterIndex];
          if (!letter) return false;

          if (inputLetter === letter) {
            wordLetterIndex += 1;
            return true;
          }

          return checkNextWord(inputLetter);
        };
        return inputLetters.every((inputLetter: string) => {
          if (checkNextLetter(inputLetter)) {
            return true;
          }
          return checkNextWord(inputLetter);
        });
      };

      const startFirstAndEachWordFilter = (choice: any) => {
        return (
          choice.name?.toLowerCase().startsWith(input[0]) &&
          startEachWordFilter(choice)
        );
      };

      const partialFilter = (choice: any) =>
        choice.name?.toLowerCase().includes(input);

      const [startExactMatches, notBestMatches] = partition(
        unfilteredChoices,
        startExactFilter
      );

      const [startAndFirstMatches, notStartMatches] = partition(
        notBestMatches,
        startFirstAndEachWordFilter
      );

      const [startMatches, notStartAndFirstMatches] = partition(
        notStartMatches,
        startEachWordFilter
      );
      const [partialMatches, notMatches] = partition(
        notStartAndFirstMatches,
        partialFilter
      );

      const filtered = [
        ...startExactMatches,
        ...startAndFirstMatches,
        ...startMatches,
        ...partialMatches,
      ];

      const highlightedChoices = filtered.map((choice) => {
        return {
          ...choice,
          name: highlightChoiceName(choice.name as string, inputValue),
        };
      });
      setFilteredChoices(highlightedChoices as any);
    } catch (error) {
      ipcRenderer.send('PROMPT_ERROR', { error, pid });
    }
  }, [
    unfilteredChoices,
    inputValue,
    mode,
    pid,
    submitted,
    setMainHeight,
    setFilteredChoices,
  ]);
};
