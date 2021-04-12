/* eslint-disable react/no-danger */
/* eslint-disable react/jsx-props-no-spreading */
/* eslint-disable no-restricted-syntax */
/* eslint-disable guard-for-in */
/* eslint-disable jsx-a11y/click-events-have-key-events */
/* eslint-disable jsx-a11y/no-static-element-interactions */
/* eslint-disable react/no-array-index-key */
/* eslint-disable react/prop-types */
/* eslint-disable no-nested-ternary */
/* eslint-disable @typescript-eslint/no-shadow */
/* eslint-disable jsx-a11y/no-autofocus */
/* eslint-disable jsx-a11y/label-has-associated-control */
import React, {
  ErrorInfo,
  KeyboardEvent,
  RefObject,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import parse from 'html-react-parser';
import { useDebouncedCallback } from 'use-debounce';
import { ipcRenderer } from 'electron';
import SimpleBar from 'simplebar-react';
import { partition } from 'lodash';
import isImage from 'is-image';
import usePrevious from '@rooks/use-previous';
import { KitPromptOptions } from './types';
import {
  CHOICE_FOCUSED,
  GENERATE_CHOICES,
  RESET_PROMPT,
  RUN_SCRIPT,
  SET_CHOICES,
  SET_HINT,
  SET_INPUT,
  SET_MODE,
  SET_PANEL,
  SET_PLACEHOLDER,
  SET_TAB_INDEX,
  SHOW_PROMPT,
  TAB_CHANGED,
  VALUE_SUBMITTED,
} from './channels';

interface ChoiceData {
  name: string;
  value: string;
  preview: string | null;
}

enum MODE {
  GENERATE = 'GENERATE',
  FILTER = 'FILTER',
  MANUAL = 'MANUAL',
}

class ErrorBoundary extends React.Component {
  // eslint-disable-next-line react/state-in-constructor
  public state: { hasError: boolean } = { hasError: false };

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Display fallback UI
    this.setState({ hasError: true });
    // You can also log the error to an error reporting service
    ipcRenderer.send('PROMPT_ERROR', error);
  }

  render() {
    // eslint-disable-next-line react/destructuring-assignment
    if (this.state.hasError) {
      // You can render any custom fallback UI
      return <h1>Something went wrong.</h1>;
    }
    // eslint-disable-next-line react/destructuring-assignment
    return this.props.children;
  }
}

const noHighlight = (name: string, input: string) => {
  return <span>{name}</span>;
};

const highlightAdjacentAndWordStart = (name: string, input: string) => {
  const inputLetters = input?.toLowerCase().split('');
  let ili = 0;
  let prevQualifies = true;

  // TODO: Optimize
  return name.split('').map((letter, i) => {
    if (letter?.toLowerCase() === inputLetters[ili] && prevQualifies) {
      ili += 1;
      prevQualifies = true;
      return (
        <span key={i} className="dark:text-primary-light text-primary-dark">
          {letter}
        </span>
      );
    }

    prevQualifies = Boolean(letter.match(/\W/));

    return <span key={i}>{letter}</span>;
  });
};

const highlightFirstLetters = (name: string, input: string) => {
  const words = name.match(/\w+\W*/g);

  return (words || []).map((word, i) => {
    if (input[i]) {
      return (
        // eslint-disable-next-line react/no-array-index-key
        <React.Fragment key={i}>
          <span key={i} className=" dark:text-primary-light text-primary-dark">
            {word[0]}
          </span>
          {word.slice(1)}
        </React.Fragment>
      );
    }

    return word;
  });
};
const highlightIncludes = (name: string, input: string) => {
  const index = name?.toLowerCase().indexOf(input?.toLowerCase());
  const indexEnd = index + input.length;

  const firstPart = name.slice(0, index);
  const includesPart = name.slice(index, indexEnd);
  const lastPart = name.slice(indexEnd);

  return [
    <span key={0}>{firstPart}</span>,
    <span key={1} className="dark:text-primary-light text-primary-dark">
      {includesPart}
    </span>,
    <span key={2}>{lastPart}</span>,
  ];
};

const highlightStartsWith = (name: string, input: string) => {
  const firstPart = name.slice(0, input.length);
  const lastPart = name.slice(input.length);

  return [
    <span key={0} className="dark:text-primary-light text-primary-dark">
      {firstPart}
    </span>,
    <span key={1}>{lastPart}</span>,
  ];
};

const firstLettersMatch = (name: string, input: string) => {
  const splitName = name.match(/\w+\W*/g) || [];
  const inputLetters = input.split('');
  if (inputLetters.length > splitName.length) return false;

  return inputLetters.every((il, i) => {
    return il === splitName[i][0];
  });
};

export default function App() {
  const [promptData, setPromptData]: any = useState({});

  const [inputValue, setInputValue] = useState('');
  const [hint, setHint] = useState('');
  const [mode, setMode] = useState(MODE.FILTER);
  const [index, setIndex] = useState(0);
  const [tabs, setTabs] = useState([]);
  const [tabIndex, setTabIndex] = useState(0);
  const [unfilteredChoices, setUnfilteredChoices] = useState<ChoiceData[]>([]);
  const [choices, setChoices] = useState<ChoiceData[]>([]);
  const [placeholder, setPlaceholder] = useState('');
  const previousPlaceholder: string | null = usePrevious(placeholder);
  const [dropReady, setDropReady] = useState(false);
  const [panelHTML, setPanelHTML] = useState('');
  const [scriptName, setScriptName] = useState('');
  const [caretDisabled, setCaretDisabled] = useState(false);
  const scrollRef: RefObject<HTMLDivElement> = useRef(null);
  const inputRef: RefObject<HTMLInputElement> = useRef(null);

  useEffect(() => {
    if (inputRef.current) {
      inputRef?.current.focus();
    }
  }, [inputRef]);

  useEffect(() => {
    setTabs(promptData?.tabs || []);
  }, [promptData?.tabs]);

  useEffect(() => {
    setIndex(0);
  }, [unfilteredChoices]);

  const submit = useCallback((value: any) => {
    setPlaceholder(typeof value === 'string' ? value : 'Processing...');
    setUnfilteredChoices([]);
    setPanelHTML('');
    setInputValue('');

    if (Array.isArray(value)) {
      const files = value.map((file) => {
        const fileObject: any = {};

        for (const key in file) {
          const value = file[key];
          const notFunction = typeof value !== 'function';
          if (notFunction) fileObject[key] = value;
        }

        return fileObject;
      });
      console.log(files);
      ipcRenderer.send(VALUE_SUBMITTED, { value: files });
      return;
    }

    ipcRenderer.send(VALUE_SUBMITTED, { value });
  }, []);

  useEffect(() => {
    if (index > choices?.length - 1) setIndex(choices?.length - 1);
    if (choices?.length && index <= 0) setIndex(0);
  }, [choices?.length, index]);

  const onChange = useCallback((value) => {
    setIndex(0);
    setInputValue(value);
  }, []);

  const onDragEnter = useCallback((event) => {
    setDropReady(true);
    setPlaceholder('Drop to submit');
  }, []);
  const onDragLeave = useCallback((event) => {
    setDropReady(false);
    setPlaceholder(previousPlaceholder || '');
  }, []);
  const onDrop = useCallback((event) => {
    setDropReady(false);
    submit(Array.from(event?.dataTransfer?.files));
  }, []);

  useEffect(() => {
    if (choices?.length > 0 && choices?.[index]) {
      ipcRenderer.send(CHOICE_FOCUSED, choices[index]);
    }
    if (choices?.length === 0) {
      ipcRenderer.send(CHOICE_FOCUSED, null);
    }
  }, [choices, index]);

  const onTabClick = useCallback(
    (ti) => (_event: any) => {
      setTabIndex(ti);
      ipcRenderer.send(TAB_CHANGED, { tab: tabs[ti], input: inputValue });
    },
    [inputValue, tabs]
  );

  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      if (event.key === 'Escape') {
        setChoices([]);
        setInputValue('');
        setPanelHTML('');
        setPromptData({});
        return;
      }
      if (event.key === 'Enter') {
        submit(choices?.[index]?.value || inputValue);
        return;
      }

      if (event.key === 'Tab') {
        event.preventDefault();
        if (tabs?.length) {
          const clamp = tabs.length;
          const clampIndex = (tabIndex + (event.shiftKey ? -1 : 1)) % clamp;
          const nextIndex = clampIndex < 0 ? clamp - 1 : clampIndex;
          setTabIndex(nextIndex);
          ipcRenderer.send(TAB_CHANGED, {
            tab: tabs[nextIndex],
            input: inputValue,
          });
        }
        return;
      }

      if (tabs?.length) {
        tabs.forEach((_tab, i) => {
          // cmd+2, etc.
          if (event.metaKey && event.key === `${i + 1}`) {
            event.preventDefault();
            setTabIndex(i);
            ipcRenderer.send(TAB_CHANGED, {
              tab: tabs[i],
              input: inputValue,
            });
          }
        });
      }

      let newIndex = index;

      if (event.key === 'ArrowDown') {
        event.preventDefault();
        newIndex += 1;
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        newIndex -= 1;
      }

      if (newIndex < 0) newIndex = 0;
      if (newIndex > choices?.length - 1) newIndex = choices?.length - 1;

      setIndex(newIndex);

      if (scrollRef.current) {
        const el = scrollRef.current;
        const selectedItem: any = el.firstElementChild?.children[newIndex];
        const itemY = selectedItem?.offsetTop;
        const marginBottom = parseInt(
          getComputedStyle(selectedItem as any)?.marginBottom.replace('px', ''),
          10
        );
        if (
          itemY >=
          el.scrollTop + el.clientHeight - selectedItem.clientHeight
        ) {
          selectedItem?.scrollIntoView({ block: 'end', inline: 'nearest' });
          el.scrollTo({
            top: el.scrollTop + marginBottom,
          });
        } else if (itemY < el.scrollTop) {
          selectedItem?.scrollIntoView({ block: 'start', inline: 'nearest' });
        }
      }
    },
    [index, choices, setPromptData, submit, inputValue, tabs, tabIndex]
  );

  const generateChoices = useDebouncedCallback((value, mode, tab) => {
    if (mode === MODE.GENERATE) {
      ipcRenderer.send(GENERATE_CHOICES, value);
    }
  }, 150);

  useEffect(() => {
    generateChoices(inputValue, mode, tabIndex);
  }, [mode, inputValue, tabIndex]);

  useEffect(() => {
    setCaretDisabled(Boolean(!promptData?.placeholder));
  }, [promptData?.placeholder]);

  useEffect(() => {
    try {
      if (mode === (MODE.GENERATE || MODE.MANUAL)) {
        setChoices(unfilteredChoices);
        return;
      }
      if (!unfilteredChoices?.length) {
        setChoices([]);
        return;
      }

      const input = inputValue?.toLowerCase() || '';

      const startExactFilter = (choice: any) =>
        choice.name?.toLowerCase().startsWith(input);

      const startEachWordFilter = (choice: any) => {
        let wordIndex = 0;
        let wordLetterIndex = 0;
        const words = choice.name?.toLowerCase().match(/\w+\W*/g);
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

      setChoices(filtered);
    } catch (error) {
      ipcRenderer.send('PROMPT_ERROR', error);
    }
  }, [unfilteredChoices, inputValue, mode]);

  const showPromptHandler = useCallback(
    (_event: any, promptData: KitPromptOptions) => {
      setPlaceholder('');
      setPanelHTML('');
      setPromptData(promptData);
      if (inputRef.current) {
        inputRef?.current.focus();
      }
    },
    []
  );

  const setTabIndexHandler = useCallback(
    (_event: any, { tabIndex: ti }: any) => {
      setPanelHTML('');
      setTabIndex(ti);
    },
    []
  );

  const setPlaceholderHandler = useCallback((_event: any, { text }: any) => {
    setPlaceholder(text);
  }, []);

  const setPanelHandler = useCallback((_event: any, { html }: any) => {
    setPanelHTML(html);
    setChoices([]);
  }, []);

  const setModeHandler = useCallback((_event: any, { mode }: any) => {
    setMode(mode);
  }, []);

  const setHintHandler = useCallback((_event: any, { hint }: any) => {
    setHint(hint);
  }, []);

  const setInputHandler = useCallback((_event: any, { input }: any) => {
    setInputValue(input);
  }, []);

  const setChoicesHandler = useCallback((_event: any, { choices }: any) => {
    setPanelHTML('');
    setUnfilteredChoices(choices);
  }, []);

  const resetPromptHandler = useCallback((event, data) => {
    setPlaceholder('');
    setDropReady(false);
    setChoices([]);
    setHint('');
    setInputValue('');
    setPanelHTML('');
    setPromptData({});
    setTabs([]);
    setUnfilteredChoices([]);
  }, []);

  const messageMap = {
    [RESET_PROMPT]: resetPromptHandler,
    [RUN_SCRIPT]: resetPromptHandler,
    [SET_CHOICES]: setChoicesHandler,
    [SET_HINT]: setHintHandler,
    [SET_INPUT]: setInputHandler,
    [SET_MODE]: setModeHandler,
    [SET_PANEL]: setPanelHandler,
    [SET_PLACEHOLDER]: setPlaceholderHandler,
    [SET_TAB_INDEX]: setTabIndexHandler,
    [SHOW_PROMPT]: showPromptHandler,
  };

  useEffect(() => {
    Object.entries(messageMap).forEach(([key, value]: any) => {
      if (ipcRenderer.listenerCount(key) === 0) {
        ipcRenderer.on(key, (event, data) => {
          if (data?.kitScript) setScriptName(data?.kitScript);
          value(event, data);
        });
      }
    });

    return () => {
      Object.entries(messageMap).forEach(([key, value]: any) => {
        ipcRenderer.off(key, value);
      });
    };
  }, []);

  return (
    <ErrorBoundary>
      <div
        style={{
          WebkitAppRegion: 'drag',
          WebkitUserSelect: 'none',
        }}
        className={`flex flex-col w-full overflow-y-hidden rounded-lg max-h-screen min-h-full
        ${
          dropReady
            ? `border-b-4 border-green-500 border-solid border-opacity-50`
            : `border-none`
        }
        `}
      >
        {promptData?.scriptInfo?.description && (
          <div className="flex flex-row text-xs uppercase font-mono justify-between pt-3 px-4">
            <span>{promptData?.scriptInfo?.description || ''}</span>
            <span>
              {promptData?.scriptInfo?.menu}
              {promptData?.scriptInfo?.twitter && (
                <span>
                  <span> - </span>
                  <a
                    href={`https://twitter.com/${promptData?.scriptInfo?.twitter.slice(
                      1
                    )}`}
                  >
                    {promptData?.scriptInfo?.twitter}
                  </a>
                </span>
              )}
            </span>
          </div>
        )}
        <input
          style={{
            WebkitAppRegion: 'drag',
            WebkitUserSelect: 'none',
            minHeight: '4rem',
            ...(caretDisabled && { caretColor: 'transparent' }),
          }}
          autoFocus
          className={`bg-transparent w-full text-black dark:text-white focus:outline-none outline-none text-xl dark:placeholder-white dark:placeholder-opacity-70 placeholder-black placeholder-opacity-80 h-16 focus:border-none border-none ring-0 ring-opacity-0 focus:ring-0 focus:ring-opacity-0 pl-4
          ${dropReady && `border-2 border-green-500`}
          `}
          onChange={(e) => onChange(e.target.value)}
          onDragEnter={promptData?.drop ? onDragEnter : undefined}
          onDragLeave={promptData?.drop ? onDragLeave : undefined}
          onDrop={promptData?.drop ? onDrop : undefined}
          onKeyDown={onKeyDown}
          placeholder={placeholder || promptData?.placeholder}
          ref={inputRef}
          type={promptData?.secret ? 'password' : 'text'}
          value={inputValue}
        />
        {hint && (
          <div className="pl-3 pb-3 text-sm text-black dark:text-white">
            {hint}
          </div>
        )}
        {tabs?.length > 0 && (
          <SimpleBar className="overscroll-y-none">
            <div className="flex flex-row pl-2 pb-2 whitespace-nowrap">
              {/* <span className="bg-white">{modeIndex}</span> */}
              {tabs.map((tab: string, i: number) => {
                return (
                  // I need to research a11y for apps vs. "sites"
                  <div
                    className={`text-xs px-2 py-1 mb-1 mx-px dark:bg-o rounded-full font-medium cursor-pointer dark:bg-white bg-white hover:opacity-100 dark:hover:opacity-100 dark:hover:bg-opacity-10 hover:bg-opacity-80 ${
                      i === tabIndex
                        ? 'opacity-100 dark:bg-opacity-10 bg-opacity-80'
                        : 'opacity-70 dark:bg-opacity-0 bg-opacity-0'
                    }
                  transition-all ease-in-out duration-100
                  `}
                    key={tab}
                    onClick={onTabClick(i)}
                  >
                    {tab}
                  </div>
                );
              })}
            </div>
          </SimpleBar>
        )}
        {panelHTML?.length > 0 && (
          <SimpleBar
            style={{
              WebkitAppRegion: 'no-drag',
              WebkitUserSelect: 'text',
            }}
            className="px-4 py-1 flex flex-col prose dark:prose-dark w-full max-h-full overflow-y-scroll focus:border-none focus:outline-none outline-none"
          >
            {parse(panelHTML)}
          </SimpleBar>
        )}

        {choices?.length > 0 && (
          <div
            className="flex flex-row w-full max-h-full overflow-y-hidden"
            style={{
              WebkitAppRegion: 'no-drag',
              WebkitUserSelect: 'none',
            }}
          >
            <SimpleBar
              scrollableNodeProps={{ ref: scrollRef }}
              className="px-0 pb-4 flex flex-col text-black dark:text-white max-h-full overflow-y-scroll focus:border-none focus:outline-none outline-none flex-1 bg-opacity-20"
              // style={{ maxHeight: '85vh' }}
            >
              {((choices as any[]) || []).map((choice, i) => {
                const input = inputValue?.toLowerCase();
                const name = choice?.name?.toLowerCase();
                return (
                  // eslint-disable-next-line jsx-a11y/click-events-have-key-events
                  <button
                    type="button"
                    key={choice.uuid}
                    className={`
                w-full
                h-16
                whitespace-nowrap
                text-left
                flex
                flex-row
                text-lg
                px-4
                justify-between
                items-center
                focus:outline-none
                transition-all
                ease-in-out
                duration-100
                ${
                  index === i
                    ? `dark:bg-white dark:bg-opacity-5 bg-white bg-opacity-80 shadow-lg`
                    : ``
                }`}
                    onClick={(_event) => {
                      submit(choice.value);
                    }}
                    onMouseEnter={() => {
                      setIndex(i);
                    }}
                  >
                    {choice?.html ? (
                      parse(choice?.html, {
                        replace: (domNode: any) => {
                          if (domNode?.attribs && index === i)
                            domNode.attribs.class = 'selected';
                          return domNode;
                        },
                      })
                    ) : (
                      <div className="flex flex-row h-full w-full justify-between items-center">
                        <div className="flex flex-col max-w-full truncate">
                          <div className="truncate">
                            {mode === (MODE.GENERATE || MODE.MANUAL)
                              ? noHighlight(choice.name, inputValue)
                              : name.startsWith(input)
                              ? highlightStartsWith(choice.name, inputValue)
                              : !name.match(/\w/)
                              ? noHighlight(choice.name, inputValue)
                              : firstLettersMatch(name, input)
                              ? highlightFirstLetters(choice.name, inputValue)
                              : name.includes(input)
                              ? highlightIncludes(choice.name, inputValue)
                              : highlightAdjacentAndWordStart(
                                  choice.name,
                                  inputValue
                                )}
                          </div>
                          {((index === i && choice?.selected) ||
                            choice?.description) && (
                            <div
                              className={`text-xs truncate transition-opacity ease-in-out duration-100 pb-1 ${
                                index === i ? `opacity-90` : `opacity-60`
                              }`}
                            >
                              {(index === i && choice?.selected) ||
                                choice?.description}
                            </div>
                          )}
                        </div>
                        {choice?.img && isImage(choice?.img || '') && (
                          <img
                            src={choice.img}
                            alt={choice.name}
                            className="py-2 h-full w-16"
                          />
                        )}
                      </div>
                    )}
                  </button>
                );
              })}
            </SimpleBar>
            {choices?.[index]?.preview && (
              <div className="flex-1">
                {parse(choices?.[index]?.preview as string)}
              </div>
            )}
          </div>
        )}
      </div>
    </ErrorBoundary>
  );
}
