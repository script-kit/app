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
    <div className="flex flex-col w-full overflow-y-hidden h-full">
      <input
        ref={inputRef}
        style={{ height: '12vh' }}
        className="w-full bg-white dark:bg-black bg-opacity-80  text-black text-opacity-90  dark:text-white  focus:outline-none focus:border-transparent"
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
        <div
          ref={scrollRef}
          style={{ maxHeight: '88vh' }}
          className="p-1 flex flex-col bg-white dark:bg-black bg-opacity-80  text-black text-opacity-90  dark:text-white overflow-y-scroll overflow-x-hidden"
        >
          {((choices as any[]) || []).map((choice, i) => (
            // eslint-disable-next-line jsx-a11y/click-events-have-key-events
            <button
              type="button"
              key={choice.uuid}
              className={`
              hover:bg-gray-400
              dark:hover:bg-black
              dark:hover:bg-opacity-90
              placeholder-gray-700
              dark:placeholder-gray-300
              whitespace-nowrap
              text-left
              justify-start
              flex-col
              text-xl

              p-2
              ${index === i ? `bg-black` : ``}`}
              onClick={(_event) => {
                submit(choice.value);
              }}
            >
              {reactStringReplace(choice?.name, inputValue, (match, ix) => (
                <span key={ix} className=" text-yellow-500">
                  {match}
                </span>
              ))}

              <p className={`text-xs ${index === i && `font-semibold`}`}>
                {(index === i && choice?.selected) || choice?.description}
              </p>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
