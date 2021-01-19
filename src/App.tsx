/* eslint-disable jsx-a11y/no-autofocus */
/* eslint-disable jsx-a11y/label-has-associated-control */
import React, { SyntheticEvent, useCallback, useEffect, useState } from 'react';
import { ipcRenderer, nativeTheme } from 'electron';
import { SimplePromptOptions } from './types';

interface ChoiceData {
  name: string;
  value: string;
  display: string | null;
}

export default function App() {
  const [data, setData]: any[] = useState({});
  const [value, setValue] = useState('');
  const [index, setIndex] = useState(0);
  const [choices, setChoices] = useState<ChoiceData[]>([]);

  const submit = useCallback(() => {
    if (choices[index]?.value) {
      const choiceValue = choices[index]?.value;
      ipcRenderer.send('prompt', choiceValue);
    } else {
      ipcRenderer.send('prompt', value);
    }
  }, [choices, index, value]);

  const onChange = useCallback((event) => {
    if (event.key === 'Enter') return;
    if (event.key === 'Backspace') return;
    setIndex(0);
    setValue(event.currentTarget.value);
  }, []);

  const onKeyDown = useCallback(
    (event) => {
      if (event.key === 'Backspace') {
        // setIndex(0);
        setValue(event.currentTarget.value);
        return;
      }
      if (event.key === 'Enter') {
        submit();
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
    [choices, index, submit]
  );

  useEffect(() => {
    if (data.type === 'lazy' && typeof value === 'string') {
      ipcRenderer.send('input', value);
    }
  }, [data, value]);

  useEffect(() => {
    const lazyHandler = (event, lazyChoices: any) => {
      console.log({ lazyChoices });
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
      // TOOD: Handle names
      return choice?.name.match(
        new RegExp(
          Array.from(value)
            .map((letter) => `${letter}.*`)
            .join(''),
          'i'
        )
      );
    });
    setChoices(filtered);
  }, [data, value]);

  useEffect(() => {
    ipcRenderer.on('prompt', (event, promptData: SimplePromptOptions) => {
      console.log({ promptData });
      setData(promptData);
    });
  }, []);

  const escFunction = useCallback((event) => {
    if (event.keyCode === 27) {
      ipcRenderer.send('escape');
    }
  }, []);

  useEffect(() => {
    document.addEventListener('keydown', escFunction, false);

    return () => {
      document.removeEventListener('keydown', escFunction, false);
    };
  }, []);

  return (
    <div className="flex flex-row-reverse w-full">
      <div className="w-1/2">
        <input
          className="w-full"
          type="text"
          value={value}
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
              onClick={(event) => {
                setIndex(i);
                submit();
              }}
            >
              {choice.name}
            </button>
          ))}
        </div>
      </div>
      {choices[index]?.display && (
        <div className="w-1/2 flex justify-end">
          <div
            className="bg-white"
            // eslint-disable-next-line react/no-danger
            dangerouslySetInnerHTML={{
              __html: choices[index]?.display as string,
            }}
          />
        </div>
      )}
    </div>
  );
}
