/* eslint-disable no-restricted-syntax */
/* eslint-disable react-hooks/rules-of-hooks */
import { ipcRenderer } from 'electron';
import { useAtom } from 'jotai';
import { debounce, partition } from 'lodash';
import { basename, resolve } from 'path';

import { Channel, Mode } from 'kit-bridge/cjs/enum';
import { Choice } from 'kit-bridge/cjs/type';
import { useState, useEffect, useRef } from 'react';
import { Options, useHotkeys } from 'react-hotkeys-hook';
import {
  choicesAtom,
  flagAtom,
  flagsAtom,
  flagValueAtom,
  indexAtom,
  inputAtom,
  mainHeightAtom,
  modeAtom,
  openAtom,
  pidAtom,
  prevChoicesAtom,
  prevIndexAtom,
  prevInputAtom,
  rawInputAtom,
  scriptAtom,
  selectionStartAtom,
  submittedAtom,
  submitValueAtom,
  tabIndexAtom,
  tabsAtom,
  unfilteredChoicesAtom,
} from './jotai';

import { highlightChoiceName } from './highlight';

export const useThemeDetector = () => {
  const getCurrentTheme = () =>
    window.matchMedia('(prefers-color-scheme: dark)').matches;
  const [isDarkTheme, setIsDarkTheme] = useState(getCurrentTheme());
  const mqListener = (e: MediaQueryListEvent) => {
    setIsDarkTheme(e.matches);
  };

  useEffect(() => {
    const darkThemeMq = window.matchMedia('(prefers-color-scheme: dark)');
    darkThemeMq.addEventListener('change', mqListener);
    return () => darkThemeMq.removeEventListener('change', mqListener);
  }, []);
  return isDarkTheme;
};

export const hotkeysOptions: Options = {
  enableOnTags: ['INPUT', 'TEXTAREA'],
};

export const useEscape = () => {
  const [open, setOpen] = useAtom(openAtom);
  const [flagValue, setFlagValue] = useAtom(flagValueAtom);
  const [input] = useAtom(rawInputAtom);
  const [prevInput] = useAtom(prevInputAtom);

  const [index] = useAtom(indexAtom);
  const [prevIndex] = useAtom(prevIndexAtom);

  useHotkeys(
    'escape',
    (event) => {
      event.preventDefault();
      if (flagValue) {
        setFlagValue('');
      } else {
        setOpen(false);
      }
    },
    hotkeysOptions,
    [open, flagValue, prevInput, prevIndex, index, input]
  );
};

export const useClose = () => {
  const [open, setOpen] = useAtom(openAtom);

  useHotkeys(
    'cmd+w,ctrl+w',
    (event) => {
      event.preventDefault();
      setOpen(false);
    },
    hotkeysOptions,
    [open]
  );
};

export const useSave = (getValue: () => any) => {
  const [, submit] = useAtom(submitValueAtom);

  useHotkeys(
    'cmd+s,ctrl+s',
    (event) => {
      event.preventDefault();
      submit(getValue());
    },
    hotkeysOptions
  );
};

export const useKeyIndex = () => {
  const [index, setIndex] = useAtom(indexAtom);

  useHotkeys(
    'up',
    (event) => {
      event.preventDefault();
      setIndex(index - 1);
    },
    hotkeysOptions,
    [index]
  );

  useHotkeys(
    'down',
    (event) => {
      event.preventDefault();
      setIndex(index + 1);
    },
    hotkeysOptions,
    [index]
  );
};

export const useKeyDirection = (
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

export const useEnter = () => {
  const [choices] = useAtom(choicesAtom);
  const [input] = useAtom(inputAtom);
  const [index] = useAtom(indexAtom);
  const [, submit] = useAtom(submitValueAtom);

  useHotkeys(
    'enter,return',
    (event) => {
      event.preventDefault();
      submit(choices.length ? choices[index].value : input);
    },
    hotkeysOptions,
    [input, choices, index]
  );
};

export const useFlag = () => {
  const [choices] = useAtom(choicesAtom);
  const [input] = useAtom(inputAtom);
  const [index] = useAtom(indexAtom);
  const [flagValue, setFlagValue] = useAtom(flagValueAtom);
  const [flags] = useAtom(flagsAtom);
  const [, setFlag] = useAtom(flagAtom);
  const [, submit] = useAtom(submitValueAtom);
  const [selectionStart] = useAtom(selectionStartAtom);
  const [open, setOpen] = useAtom(openAtom);
  const [prevChoices, setPrevChoices] = useAtom(prevChoicesAtom);
  const [unfilteredChoices, setUnfilteredChoices] = useAtom(
    unfilteredChoicesAtom
  );

  const flagsArray = Object.entries(flags);

  const flagsWithShortcuts = flagsArray.filter(
    ([key, value]) =>
      value?.shortcut && value?.shortcut?.toLowerCase() !== 'enter'
  );

  const shortcuts = flagsWithShortcuts
    .map(([key, value]) => value.shortcut)
    .join(',');

  const flagKeyByShortcut = (shortcut: string) =>
    flagsWithShortcuts.find(
      ([key, value]) => value.shortcut === shortcut
    )?.[0] as string;

  useHotkeys(
    shortcuts.length ? shortcuts : 'f19',
    (event, handler) => {
      event.preventDefault();
      setFlag(flagKeyByShortcut(handler.key));
      submit(choices.length ? choices[index].value : input);
    },
    hotkeysOptions,
    [flags, input, choices, index]
  );

  useHotkeys(
    flagsArray.length ? 'right' : 'f18',
    (event) => {
      if (selectionStart === input.length) {
        event.preventDefault();
        if (!flagValue)
          setFlagValue(choices.length ? choices[index].value : input);
      }
    },
    hotkeysOptions,
    [input, choices, index, selectionStart, flagValue]
  );

  useHotkeys(
    flagsArray.length ? 'left' : 'f17',
    (event) => {
      if (selectionStart === 0) {
        event.preventDefault();
        if (flagValue) {
          setFlagValue('');
          setUnfilteredChoices(prevChoices);
        } else {
          setOpen(false);
        }
      }
    },
    hotkeysOptions,
    [input, choices, index, selectionStart, flagValue]
  );
};

export const useTab = () => {
  const [tabIndex, setTabIndex] = useAtom(tabIndexAtom);
  const [tabs] = useAtom(tabsAtom);

  useHotkeys(
    'tab,shift+tab',
    (event) => {
      event.preventDefault();
      if (tabs?.length) {
        const maxTab = tabs.length;
        const clampTabIndex = (tabIndex + (event.shiftKey ? -1 : 1)) % maxTab;
        const nextIndex = clampTabIndex < 0 ? maxTab - 1 : clampTabIndex;
        setTabIndex(nextIndex);
      }
    },
    hotkeysOptions,
    [tabIndex]
  );
};

export const useOpen = () => {
  const [choices] = useAtom(choicesAtom);
  const [index] = useAtom(indexAtom);
  const [script] = useAtom(scriptAtom);
  useHotkeys(
    'ctrl+o,cmd+o',
    (event) => {
      event.preventDefault();

      const filePath = (choices?.[index] as any)?.filePath;
      if (filePath) {
        ipcRenderer.send(Channel.OPEN_FILE, filePath);
      } else {
        ipcRenderer.send(Channel.OPEN_SCRIPT, script);
      }
    },
    hotkeysOptions,
    [choices, index, script]
  );
};

export const useEdit = () => {
  const [choices] = useAtom(choicesAtom);
  const [index] = useAtom(indexAtom);
  const [script] = useAtom(scriptAtom);
  useHotkeys(
    'ctrl+e,cmd+e',
    (event) => {
      event.preventDefault();

      const filePath = (choices?.[index] as any)?.filePath || script?.filePath;

      ipcRenderer.send(Channel.EDIT_SCRIPT, filePath);
    },
    hotkeysOptions,
    [choices, index, script]
  );
};

export const useGetDb = () => {
  const [choices] = useAtom(choicesAtom);
  const [index] = useAtom(indexAtom);
  const [script] = useAtom(scriptAtom);
  useHotkeys(
    'ctrl+d,cmd+d',
    (event) => {
      event.preventDefault();

      const filePath = (choices?.[index] as any)?.filePath || script?.filePath;
      const dbPath = resolve(
        filePath,
        '..',
        '..',
        'db',
        `_${basename(filePath).replace(/js$/, 'json')}`
      );
      ipcRenderer.send(Channel.OPEN_FILE, dbPath);
    },
    hotkeysOptions,
    [choices, index, script]
  );
};

export const useFocus = () => {
  const ref = useRef<any>();

  useEffect(() => {
    ref?.current.focus();
  }, []);

  return ref;
};

export const useChoices = () => {
  const [inputValue, setInput] = useAtom(inputAtom);
  const [submitted, setSubmitted] = useAtom(submittedAtom);
  const [unfilteredChoices, setUnfilteredChoices] = useAtom(
    unfilteredChoicesAtom
  );
  const [filteredChoices, setFilteredChoices] = useAtom(choicesAtom);
  const [mode, setMode] = useAtom(modeAtom);
  const [pid, setPid] = useAtom(pidAtom);
  const [mainHeight, setMainHeight] = useAtom(mainHeightAtom);

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
      setFilteredChoices(highlightedChoices);
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
