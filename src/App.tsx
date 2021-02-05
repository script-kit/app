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
import { app, ipcRenderer, nativeTheme } from 'electron';
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
    ipcRenderer.send('prompt', submitValue);
    setData({ type: 'clear', choices: [], message: 'Processing...' });
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
      ipcRenderer.send('selected', choices[index]);
    }
    if (choices?.length === 0) {
      ipcRenderer.send('selected', null);
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
        const itemHeight = el.scrollHeight / choices?.length;
        const itemY = newIndex * itemHeight;

        if (
          itemY + itemHeight + itemHeight / 2 >=
          el.scrollTop + el.clientHeight
        ) {
          el.scrollTo({
            top: itemY - el.clientHeight + itemHeight,
            behavior: 'auto',
          });
        }

        if (itemY < el.scrollTop) {
          el.scrollTo({
            top: itemY,
            behavior: 'auto',
          });
        }
      }
    },
    [choices, index, submit, inputValue, scrollRef]
  );

  useEffect(() => {
    if (data.type === 'lazy' && typeof inputValue === 'string') {
      ipcRenderer.send('input', inputValue);
    }
  }, [data, inputValue]);

  useEffect(() => {
    const lazyHandler = (_event: any, lazyChoices: any) => {
      setChoices(lazyChoices);
      if (inputRef.current) {
        inputRef?.current.focus();
      }
    };
    ipcRenderer.on('lazy', lazyHandler);

    return () => {
      ipcRenderer.off('lazy', lazyHandler);
    };
  }, []);

  useEffect(() => {
    if (data.type === 'lazy') return;
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
    if (ipcRenderer.listenerCount('prompt') === 0) {
      ipcRenderer.on('prompt', (_event, promptData: SimplePromptOptions) => {
        // console.log(`setData`, promptData);
        setData(promptData);
        setIndex(0);
        if (inputRef.current) {
          inputRef?.current.focus();
        }
      });
    }
  }, []);

  useEffect(() => {
    if (ipcRenderer.listenerCount('escape') === 0) {
      ipcRenderer.on('escape', () => {
        console.log(`ESCAPE!!!`);
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
    <div className="flex flex-col w-full overflow-y-hidden rounded-lg max-h-screen min-h-full dark:bg-gray-900 bg-white shadow-xl">
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
          className="px-4 pb-4 flex flex-col text-black dark:text-white w-full max-h-screen focus:border-none focus:outline-none outline-none"
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
              flex-col
              text-xl
              pl-4
              rounded-lg
              justify-center
              ${index === i ? `dark:bg-gray-800 bg-gray-100` : ``}`}
              onClick={(_event) => {
                submit(choice.value);
              }}
              onMouseEnter={() => {
                setIndex(i);
              }}
            >
              <div className="">
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
                  className={`text-xs ${
                    index === i && `dark:text-yellow-500 text-yellow-700`
                  }`}
                >
                  {(index === i && choice?.selected) || choice?.description}
                </div>
              )}
            </button>
          ))}
        </SimpleBar>
      )}
    </div>
  );
}
