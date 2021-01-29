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
import { SimplePromptOptions } from './types';

interface ChoiceData {
  name: string;
  value: string;
  info: string | null;
}

export default function App() {
  const [data, setData]: any[] = useState({});
  const [inputValue, setInputValue] = useState('');
  const [index, setIndex] = useState(0);
  const [choices, setChoices] = useState<ChoiceData[]>([]);
  const scrollRef: RefObject<HTMLDivElement> = useRef(null);

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

        if (itemY + itemHeight >= el.scrollTop + el.clientHeight) {
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
    };
    ipcRenderer.on('lazy', lazyHandler);

    return () => {
      ipcRenderer.off('lazy', lazyHandler);
    };
  }, []);

  useEffect(() => {
    if (data.type === 'lazy') return;
    const filtered = ((data?.choices as any[]) || [])?.filter((choice) => {
      return choice?.name.match(
        new RegExp(
          Array.from(inputValue)
            .map((letter) => `${letter}.*`)
            .join(''),
          'i'
        )
      );
    });
    setChoices(filtered);
  }, [data, inputValue]);

  useEffect(() => {
    ipcRenderer.on('prompt', (_event, promptData: SimplePromptOptions) => {
      // console.log(`setData`, promptData);
      setData(promptData);
      setIndex(0);
    });
  }, []);

  useEffect(() => {
    ipcRenderer.on('escape', () => {
      console.log(`ESCAPE!!!`);
      setData({ type: 'clear', choices: [], message: '' });
      setIndex(0);
      setInputValue('');
    });
  }, []);

  return (
    <div className="flex flex-row-reverse w-full overflow-y-hidden">
      <div className="w-1/2 h-screen">
        <input
          style={{ height: '12vh' }}
          className="w-full bg-white dark:bg-gray-800  text-black text-opacity-90  dark:text-white  focus:outline-none focus:border-transparent"
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
            .join('')}
        </div> */}
        {choices?.length > 0 && (
          <div
            ref={scrollRef}
            style={{ maxHeight: '88vh' }}
            className="p-1 flex flex-col bg-white dark:bg-gray-800  text-black text-opacity-90  dark:text-white overflow-y-scroll overflow-x-hidden"
          >
            {((choices as any[]) || []).map((choice, i) => (
              // eslint-disable-next-line jsx-a11y/click-events-have-key-events
              <button
                type="button"
                key={choice.value}
                className={`
              hover:bg-gray-400
              dark:hover:bg-gray-600
              placeholder-gray-700
              dark:placeholder-gray-300
              whitespace-nowrap
              text-left
              justify-start
              ${index === i ? `bg-gray-500` : ``}`}
                onClick={(_event) => {
                  submit(choice.value);
                }}
              >
                {choice.name}
              </button>
            ))}
          </div>
        )}
      </div>
      {choices[index]?.info && (
        <div
          style={{ height: 'fit-content' }}
          className="w-1/2 flex  bg-white dark:bg-gray-800  text-black text-opacity-90  dark:text-white overscroll-none p-1"
          // eslint-disable-next-line react/no-danger
          dangerouslySetInnerHTML={{
            __html: choices[index]?.info as string,
          }}
        />
      )}
      {data?.info && (
        <div
          style={{ height: 'fit-content' }}
          className="w-1/2 flex  bg-white dark:bg-gray-800  text-black text-opacity-90  dark:text-white overscroll-y-none p-1"
          // eslint-disable-next-line react/no-danger
          dangerouslySetInnerHTML={{
            __html: data?.info as string,
          }}
        />
      )}
    </div>
  );
}
