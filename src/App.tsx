/* eslint-disable @typescript-eslint/no-shadow */
/* eslint-disable jsx-a11y/no-autofocus */
/* eslint-disable jsx-a11y/label-has-associated-control */
import React, {
  KeyboardEvent,
  RefObject,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { ipcRenderer } from 'electron';
import SimpleBar from 'simplebar-react';
import { partition } from 'lodash';
import { SimplePromptOptions } from './types';

interface ChoiceData {
  name: string;
  value: string;
  preview: string | null;
}

export default function App() {
  const [data, setData]: any[] = useState({});
  const [inputValue, setInputValue] = useState('');
  const [info, setInfo] = useState('');
  const [index, setIndex] = useState(0);
  const [choices, setChoices] = useState<ChoiceData[]>([]);
  const scrollRef: RefObject<HTMLDivElement> = useRef(null);
  const inputRef: RefObject<HTMLInputElement> = useRef(null);

  useEffect(() => {
    if (inputRef.current) {
      inputRef?.current.focus();
    }
  }, [inputRef]);

  const submit = useCallback((submitValue: string) => {
    ipcRenderer.send('VALUE_SUBMITTED', { value: submitValue });
    setData({
      choices: [],
      message: 'Finishing script...',
    });
    setChoices([]);
    setIndex(0);
    setInputValue('');
  }, []);

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

  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      if (event.key === 'Enter') {
        submit(choices?.[index]?.value || inputValue);

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

        if (itemY >= el.scrollTop + el.clientHeight) {
          selectedItem?.scrollIntoView({ block: 'end', inline: 'nearest' });
          el.scrollTo({
            top:
              el.scrollTop +
              parseInt(
                getComputedStyle(selectedItem as any)?.marginBottom.replace(
                  'px',
                  ''
                ),
                10
              ),
          });
        } else if (itemY < el.scrollTop) {
          selectedItem?.scrollIntoView({ block: 'start', inline: 'nearest' });
        }
      }
    },
    [choices, index, submit, inputValue, scrollRef]
  );

  useEffect(() => {
    if (
      data.from === 'SHOW_PROMPT_WITH_DATA' &&
      !data.cache &&
      typeof inputValue === 'string'
    ) {
      ipcRenderer.send('INPUT_CHANGED', inputValue);
    }
  }, [data, inputValue]);

  useEffect(() => {
    if (!data?.choices?.length) return;

    const exactExpression = `^${inputValue}`;
    const partialExpression = inputValue;
    const weakExpression = inputValue.split('').join('.*');
    const startExpression = `^${weakExpression}`;

    let exactRegExp: RegExp;
    let startRegExp: RegExp;
    let partialRegExp: RegExp;
    let weakRegExp: RegExp;
    try {
      exactRegExp = new RegExp(exactExpression, 'i');
      startRegExp = new RegExp(startExpression, 'i');
      partialRegExp = new RegExp(partialExpression, 'i');
      weakRegExp = new RegExp(weakExpression, 'i');
    } catch (error) {
      exactRegExp = new RegExp('');
      startRegExp = new RegExp('');
      partialRegExp = new RegExp('');
      weakRegExp = new RegExp('');
    }

    const exactFilter = (choice: any) => choice.name.match(exactRegExp);
    const startFilter = (choice: any) => choice.name.match(startRegExp);
    const partialFilter = (choice: any) => choice.name.match(partialRegExp);
    const weakestFilter = (choice: any) => choice.name.match(weakRegExp);

    const [exactMatches, notBestMatches] = partition(data.choices, exactFilter);
    const [startMatches, notStartMatches] = partition(
      notBestMatches,
      startFilter
    );
    const [partialMatches, notMatches] = partition(
      notStartMatches,
      partialFilter
    );
    const weakestMatches = notMatches.filter(weakestFilter);

    const filtered = [
      ...exactMatches,
      ...startMatches,
      ...partialMatches,
      ...weakestMatches,
    ];

    setChoices(filtered);
  }, [data, inputValue]);

  useEffect(() => {
    const updateChoicesHandler = (_event: any, updatedChoices: any) => {
      setChoices(updatedChoices);
      if (inputRef.current) {
        inputRef?.current.focus();
      }
    };

    const showPromptHandler = (
      _event: any,
      promptData: SimplePromptOptions
    ) => {
      setData(promptData);
      setIndex(0);
      if (inputRef.current) {
        inputRef?.current.focus();
      }
    };

    const clearPromptHandler = () => {
      if (inputRef.current) {
        inputRef?.current.focus();
      }
      setData({ choices: [], message: '' });
      setChoices([]);
      setIndex(0);
      setInputValue('');
      setInfo('');
    };

    const updatePromptInfo = (_event: any, info: string) => {
      setInputValue('');
      setData({ message: info });
    };

    if (ipcRenderer.listenerCount('CLEAR_PROMPT') === 0) {
      ipcRenderer.on('CLEAR_PROMPT', clearPromptHandler);
    }

    if (ipcRenderer.listenerCount('SHOW_PROMPT_WITH_DATA') === 0) {
      ipcRenderer.on('SHOW_PROMPT_WITH_DATA', showPromptHandler);
    }

    if (ipcRenderer.listenerCount('UPDATE_PROMPT_CHOICES') === 0) {
      ipcRenderer.on('UPDATE_PROMPT_CHOICES', updateChoicesHandler);
    }

    if (ipcRenderer.listenerCount('UPDATE_PROMPT_INFO') === 0) {
      ipcRenderer.on('UPDATE_PROMPT_INFO', updatePromptInfo);
    }

    return () => {
      ipcRenderer.off('CLEAR_PROMPT', clearPromptHandler);
      ipcRenderer.off('SHOW_PROMPT_WITH_DATA', showPromptHandler);
      ipcRenderer.off('UPDATE_PROMPT_CHOICES', updateChoicesHandler);
      ipcRenderer.off('UPDATE_PROMPT_INFO', updatePromptInfo);
    };
  }, []);

  return (
    <div
      className="flex flex-col w-full overflow-y-hidden rounded-lg max-h-screen min-h-full dark:bg-gray-900 bg-white shadow-xl"
      style={{
        WebkitAppRegion: 'drag',
        WebkitUserSelect: 'none',
      }}
    >
      <input
        ref={inputRef}
        style={{ minHeight: '4rem' }}
        className="w-full text-black dark:text-white focus:outline-none outline-none text-xl dark:placeholder:text-gray-300 placeholder:text-gray-500 bg-white dark:bg-gray-900 h-16 focus:border-none border-none ring-0 ring-opacity-0 focus:ring-0 focus:ring-opacity-0 pl-4"
        type="text"
        value={inputValue}
        onChange={onChange}
        autoFocus
        placeholder={data?.message || ''}
        onKeyDown={onKeyDown}
      />
      {info && <div className="text-sm text-black dark:text-white">{info}</div>}
      {/* <div className="bg-white">
          {index} : {choices[index]?.name}
        </div>
        <div className="bg-white">
          {Array.from(value)
            .map((letter) => `${letter}.*`)
            .join('')};
        </div> */}
      {choices?.length > 0 && (
        <SimpleBar
          scrollableNodeProps={{ ref: scrollRef }}
          style={{
            WebkitAppRegion: 'no-drag',
            WebkitUserSelect: 'none',
          }}
          className="px-4 pb-4 flex flex-col text-black dark:text-white w-full max-h-full overflow-y-scroll focus:border-none focus:outline-none outline-none"
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
              dark:hover:bg-gray-800
              hover:bg-gray-100
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
                    {name.includes(input)
                      ? [
                          choice.name.slice(0, name.indexOf(input)),
                          <span
                            key={input}
                            className=" dark:text-yellow-500 text-yellow-700"
                          >
                            {choice.name.slice(
                              name.indexOf(input),
                              name.indexOf(input) + input.length
                            )}
                          </span>,
                          choice.name.slice(name.indexOf(input) + input.length),
                        ]
                      : choice.name.split('').reduce(
                          (acc: any, char: string) => {
                            const c = char.toLowerCase();
                            const testChar = acc.test.toLowerCase()[
                              acc.testIndex
                            ];

                            if (!testChar || testChar !== c) {
                              acc.result.push(char);
                            } else {
                              acc.testIndex += 1;
                              acc.result.push(
                                <span className=" dark:text-yellow-500 text-yellow-700">
                                  {char}
                                </span>
                              );
                            }
                            return acc;
                          },
                          { test: inputValue, testIndex: 0, result: [] }
                        ).result}
                  </div>
                  {((index === i && choice?.selected) ||
                    choice?.description) && (
                    <div
                      className={`text-xs truncate ${
                        index === i && `dark:text-yellow-500 text-yellow-700`
                      }`}
                    >
                      {(index === i && choice?.selected) || choice?.description}
                    </div>
                  )}
                </div>
                {choice?.icon && (
                  <img
                    src={choice.icon}
                    alt={choice.name}
                    className="py-2 h-full"
                  />
                )}
              </button>
            );
          })}
        </SimpleBar>
      )}
    </div>
  );
}
