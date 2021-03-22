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
import { useDebounce } from '@react-hook/debounce';
import { ipcRenderer } from 'electron';
import SimpleBar from 'simplebar-react';
import { partition } from 'lodash';
import isImage from 'is-image';
import { KitPromptOptions } from './types';
import {
  SET_PROMPT_TEXT,
  SET_TAB_INDEX,
  SHOW_PROMPT_WITH_DATA,
  UPDATE_PROMPT_CHOICES,
  UPDATE_PROMPT_INFO,
  VALUE_SUBMITTED,
} from './channels';

interface ChoiceData {
  name: string;
  value: string;
  preview: string | null;
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
  const inputLetters = input.toLowerCase().split('');
  let ili = 0;
  let prevQualifies = true;

  // TODO: Optimize
  return name.split('').map((letter, i) => {
    if (letter.toLowerCase() === inputLetters[ili] && prevQualifies) {
      ili += 1;
      prevQualifies = true;
      return (
        <span key={i} className=" dark:text-yellow-500 text-yellow-700">
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
          <span key={i} className=" dark:text-yellow-500 text-yellow-700">
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
  const index = name.toLowerCase().indexOf(input.toLowerCase());
  const indexEnd = index + input.length;

  const firstPart = name.slice(0, index);
  const includesPart = name.slice(index, indexEnd);
  const lastPart = name.slice(indexEnd);

  return [
    <span key={0}>{firstPart}</span>,
    <span key={1} className=" dark:text-yellow-500 text-yellow-700">
      {includesPart}
    </span>,
    <span key={2}>{lastPart}</span>,
  ];
};

const highlightStartsWith = (name: string, input: string) => {
  const firstPart = name.slice(0, input.length);
  const lastPart = name.slice(input.length);

  return [
    <span key={0} className=" dark:text-yellow-500 text-yellow-700">
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
  const [data, setData]: any[] = useState({});
  const [inputValue, setInputValue] = useState('');
  const [info, setInfo] = useState('');
  const [index, setIndex] = useState(0);
  const [tabs, setTabs] = useState([]);
  const [tabIndex, setTabIndex] = useState(0);
  const [channel, setChannel] = useState('');
  const [choices, setChoices] = useState<ChoiceData[]>([]);
  const [promptText, setPromptText] = useDebounce('');
  const [caretDisabled, setCaretDisabled] = useState(false);
  const scrollRef: RefObject<HTMLDivElement> = useRef(null);
  const inputRef: RefObject<HTMLInputElement> = useRef(null);

  useEffect(() => {
    if (inputRef.current) {
      inputRef?.current.focus();
    }
  }, [inputRef]);

  useEffect(() => {
    setTabs(data?.tabs || []);
  }, [data?.tabs]);

  const submit = useCallback(
    (submitValue: string) => {
      setInputValue('');
      setPromptText(submitValue);

      ipcRenderer.send(VALUE_SUBMITTED, { value: submitValue });
    },
    [setPromptText]
  );

  useEffect(() => {
    if (index > choices?.length - 1) setIndex(choices?.length - 1);
    if (choices?.length && index <= 0) setIndex(0);
  }, [choices?.length, index]);

  const onChange = useCallback((event) => {
    if (event.key === 'Enter') return;
    setInfo('');
    setIndex(0);
    setInputValue(event.currentTarget.value);
  }, []);

  useEffect(() => {
    if (choices?.length > 0 && choices?.[index]) {
      ipcRenderer.send('VALUE_SELECTED', choices[index]);
    }
    if (choices?.length === 0) {
      ipcRenderer.send('VALUE_SELECTED', null);
    }
  }, [choices, index]);

  const onTabClick = useCallback(
    (ti) => (_event: any) => {
      setTabIndex(ti);
      ipcRenderer.send('TAB_CHANGED', tabs[ti]);
    },
    [tabs]
  );

  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
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
          ipcRenderer.send('TAB_CHANGED', tabs[nextIndex]);
        }
        return;
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
      if (newIndex > choices.length - 1) newIndex = choices.length - 1;

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
    [index, choices, submit, inputValue, tabIndex, tabs]
  );

  useEffect(() => {
    if (
      data.from === SHOW_PROMPT_WITH_DATA &&
      !data.cache &&
      typeof inputValue === 'string'
    ) {
      ipcRenderer.send('INPUT_CHANGED', inputValue);
    }
  }, [data, inputValue]);

  useEffect(() => {
    try {
      setCaretDisabled(false);
      if (!data?.choices?.length) {
        setChoices([]);
        return;
      }
      if (!data?.choices?.length || data?.from === UPDATE_PROMPT_CHOICES)
        return;

      const input = inputValue.toLowerCase();

      const startExactFilter = (choice: any) =>
        choice.name.toLowerCase().startsWith(input);

      const startEachWordFilter = (choice: any) => {
        let wordIndex = 0;
        let wordLetterIndex = 0;
        const words = choice.name.toLowerCase().match(/\w+\W*/g);
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
          choice.name.toLowerCase().startsWith(input[0]) &&
          startEachWordFilter(choice)
        );
      };

      const partialFilter = (choice: any) =>
        choice.name.toLowerCase().includes(input);

      const [startExactMatches, notBestMatches] = partition(
        data.choices,
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
  }, [data, inputValue, tabs]);

  useEffect(() => {
    setInputValue('');
  }, [data]);

  useEffect(() => {
    const updateChoicesHandler = (_event: any, updatedChoices: any) => {
      setChannel(UPDATE_PROMPT_CHOICES);
      setChoices(updatedChoices);
      if (inputRef.current) {
        inputRef?.current.focus();
      }
    };

    const showPromptHandler = (_event: any, promptData: KitPromptOptions) => {
      setChannel(SHOW_PROMPT_WITH_DATA);
      setPromptText('');
      setData(promptData);
      if (inputRef.current) {
        inputRef?.current.focus();
      }
    };

    const updatePromptInfo = (_event: any, info: string) => {
      setChannel(UPDATE_PROMPT_INFO);
    };

    const setTabIndexHandler = (_event: any, ti: number) => {
      setTabIndex(ti);
    };

    const setPromptTextHandler = (_event: any, text: string) => {
      setPromptText(text);
      setCaretDisabled(true);
    };

    if (ipcRenderer.listenerCount(SHOW_PROMPT_WITH_DATA) === 0) {
      ipcRenderer.on(SHOW_PROMPT_WITH_DATA, showPromptHandler);
    }

    if (ipcRenderer.listenerCount(UPDATE_PROMPT_CHOICES) === 0) {
      ipcRenderer.on(UPDATE_PROMPT_CHOICES, updateChoicesHandler);
    }

    if (ipcRenderer.listenerCount(SET_TAB_INDEX) === 0) {
      ipcRenderer.on(SET_TAB_INDEX, setTabIndexHandler);
    }

    if (ipcRenderer.listenerCount(SET_PROMPT_TEXT) === 0) {
      ipcRenderer.on(SET_PROMPT_TEXT, setPromptTextHandler);
    }

    return () => {
      ipcRenderer.off(SHOW_PROMPT_WITH_DATA, showPromptHandler);
      ipcRenderer.off(UPDATE_PROMPT_CHOICES, updateChoicesHandler);
      ipcRenderer.off(UPDATE_PROMPT_INFO, updatePromptInfo);
      ipcRenderer.off(SET_TAB_INDEX, setTabIndexHandler);
      ipcRenderer.off(SET_PROMPT_TEXT, setPromptTextHandler);
    };
  }, []);

  return (
    <ErrorBoundary>
      <div
        style={{
          WebkitAppRegion: 'drag',
          WebkitUserSelect: 'none',
        }}
        className="flex flex-col w-full overflow-y-hidden rounded-lg max-h-screen min-h-full dark:bg-gray-900 bg-white shadow-xl"
      >
        <div className="flex flex-row text-xs dark:text-yellow-500 text-yellow-700 justify-between pt-2 px-4">
          <span>{data?.scriptInfo?.description || ''}</span>

          <span>
            {data?.scriptInfo?.menu}
            {data?.scriptInfo?.twitter && (
              <span>
                <span> - </span>
                <a
                  href={`https://twitter.com/${data?.scriptInfo?.twitter.slice(
                    1
                  )}`}
                >
                  {data?.scriptInfo?.twitter}
                </a>
              </span>
            )}
          </span>
        </div>
        <input
          ref={inputRef}
          style={{
            WebkitAppRegion: 'drag',
            WebkitUserSelect: 'none',
            minHeight: '4rem',
            ...(caretDisabled && { caretColor: 'transparent' }),
          }}
          className="w-full text-black dark:text-white focus:outline-none outline-none text-xl dark:placeholder:text-gray-300 placeholder:text-gray-500 bg-white dark:bg-gray-900 h-16 focus:border-none border-none ring-0 ring-opacity-0 focus:ring-0 focus:ring-opacity-0 pl-4"
          type={data?.secret ? 'password' : 'text'}
          value={inputValue}
          onChange={onChange}
          autoFocus
          placeholder={promptText || data?.message}
          onKeyDown={onKeyDown}
        />
        {info && (
          <div className="text-sm text-black dark:text-white">{info}</div>
        )}
        {tabs?.length > 0 && (
          <div className="flex flex-row pl-4">
            {/* <span className="bg-white">{modeIndex}</span> */}
            {tabs.map((tab: string, i: number) => (
              // I need to research a11y for apps vs. "sites"
              <div
                className={` dark:text-yellow-500 text-yellow-700 text-xs p-1 mb-1 mx-1 hover:underline  ${
                  i === tabIndex && 'underline'
                }`}
                key={tab}
                onClick={onTabClick(i)}
              >
                {tab}
              </div>
            ))}
          </div>
        )}

        {choices?.length > 0 && (
          <SimpleBar
            scrollableNodeProps={{ ref: scrollRef }}
            style={{
              WebkitAppRegion: 'no-drag',
              WebkitUserSelect: 'none',
            }}
            className="px-4 pb-4 flex flex-col text-black dark:text-white w-full max-h-full overflow-y-scroll focus:border-none focus:outline-none outline-none bg-white dark:bg-gray-900"
            // style={{ maxHeight: '85vh' }}
          >
            {((choices as any[]) || []).map((choice, i) => {
              const input = inputValue.toLowerCase();
              const name = choice?.name?.toLowerCase();
              return (
                // eslint-disable-next-line jsx-a11y/click-events-have-key-events
                <button
                  type="button"
                  key={choice.uuid}
                  className={`
                w-full
                my-1
                h-16
                whitespace-nowrap
                text-left
                flex
                flex-row
                text-xl
                px-4
                rounded-lg
                justify-between
                items-center
                ${index === i ? `dark:bg-gray-800 bg-gray-100 shadow` : ``}`}
                  onClick={(_event) => {
                    submit(choice.value);
                  }}
                  onMouseEnter={() => {
                    setIndex(i);
                  }}
                >
                  <div className="flex flex-col max-w-full mr-2 truncate">
                    <div className="truncate">
                      {channel === UPDATE_PROMPT_CHOICES
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
                        className={`text-xs truncate ${
                          index === i && `dark:text-yellow-500 text-yellow-700`
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
                      className="py-2 h-full"
                    />
                  )}
                  {choice?.html && (
                    <div
                      // eslint-disable-next-line react/no-danger
                      dangerouslySetInnerHTML={{ __html: choice?.html }}
                      className="py-2 h-full"
                    />
                  )}
                </button>
              );
            })}
          </SimpleBar>
        )}
      </div>
    </ErrorBoundary>
  );
}
