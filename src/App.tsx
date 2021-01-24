/* eslint-disable jsx-a11y/no-autofocus */
/* eslint-disable jsx-a11y/label-has-associated-control */
import React, { KeyboardEvent, useCallback, useEffect, useState } from 'react';
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

  const submit = useCallback((submitValue: string) => {
    ipcRenderer.send('prompt', submitValue);
    setData({ type: 'clear', choices: [], message: '' });
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
    },
    [choices, index, submit, inputValue]
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
      console.log(`setData`, promptData);
      setData(promptData);
    });
  }, []);

  return (
    <div className="flex flex-row-reverse w-full">
      <div className="w-1/2">
        <input
          className="w-full"
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
        <div className="bg-gray-50 p-1 flex flex-col">
          {((choices as any[]) || []).map((choice, i) => (
            // eslint-disable-next-line jsx-a11y/click-events-have-key-events
            <button
              type="button"
              key={choice.value}
              className={`
              hover:bg-gray-400
              whitespace-nowrap
              text-left
              justify-start
              ${index === i ? `bg-gray-300` : ``}`}
              onClick={(_event) => {
                submit(choice.value);
              }}
            >
              {choice.name}
            </button>
          ))}
        </div>
      </div>
      {choices[index]?.info && (
        <div
          className="w-1/2 flex justify-end"
          // eslint-disable-next-line react/no-danger
          dangerouslySetInnerHTML={{
            __html: choices[index]?.info as string,
          }}
        />
      )}
    </div>
  );
}
