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
import reactStringReplace from 'react-string-replace';
import SimpleBar from 'simplebar-react';
import { SimplePromptOptions } from './types';

interface ChoiceData {
  name: string;
  value: string;
  preview: string | null;
}

export default function App() {
  const [data, setData]: any[] = useState({});
  const [inputValue, setInputValue] = useState('');
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
    setData({ type: 'clear', choices: [], message: 'Finishing script...' });
    setIndex(0);
    setInputValue('');
  }, []);

  const onChange = useCallback((event) => {
    if (event.key === 'Enter') return;
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
      // console.log(event);
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
        console.log({
          itemY,
          scrollTop: el.scrollTop,
          clientHeight: el.clientHeight,
          scrollHeight: el.scrollHeight,
        });
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
    const updateHandler = (_event: any, updatedChoices: any) => {
      setChoices(updatedChoices);
      if (inputRef.current) {
        inputRef?.current.focus();
      }
    };
    ipcRenderer.on('UPDATE_PROMPT_CHOICES', updateHandler);

    return () => {
      ipcRenderer.off('UPDATE_PROMPT_CHOICES', updateHandler);
    };
  }, []);

  useEffect(() => {
    if (!data?.choices) return;
    const filtered = ((data?.choices as any[]) || [])?.filter((choice) => {
      try {
        return choice?.name.match(new RegExp(inputValue, 'i'));
      } catch (error) {
        return false;
      }
    });
    setChoices(filtered);
  }, [data, inputValue]);

  useEffect(() => {
    if (ipcRenderer.listenerCount('SHOW_PROMPT_WITH_DATA') === 0) {
      ipcRenderer.on(
        'SHOW_PROMPT_WITH_DATA',
        (_event, promptData: SimplePromptOptions) => {
          setData(promptData);
          setIndex(0);
          if (inputRef.current) {
            inputRef?.current.focus();
          }
        }
      );
    }
  }, []);

  useEffect(() => {
    if (ipcRenderer.listenerCount('clear') === 0) {
      ipcRenderer.on('clear', () => {
        if (inputRef.current) {
          inputRef?.current.focus();
        }
        setData({ type: 'clear', choices: [], message: '' });
        setIndex(0);
        setInputValue('');
      });
    }
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
          {((choices as any[]) || []).map((choice, i) => (
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
                  {inputValue
                    ? reactStringReplace(
                        choice?.name,
                        inputValue,
                        (match, ix) => (
                          <span
                            key={ix}
                            className=" dark:text-yellow-500 text-yellow-700"
                          >
                            {match}
                          </span>
                        )
                      )
                    : choice?.name}
                </div>
                {((index === i && choice?.selected) || choice?.description) && (
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
          ))}
        </SimpleBar>
      )}
    </div>
  );
}
