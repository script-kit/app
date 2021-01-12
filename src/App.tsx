/* eslint-disable jsx-a11y/no-autofocus */
/* eslint-disable jsx-a11y/label-has-associated-control */
import React, { FormEvent, useEffect, useState } from 'react';
import { ipcRenderer, nativeTheme } from 'electron';
import { SimplePromptOptions } from './types';

interface PromptProps {
  onSubmit: any;
  data: SimplePromptOptions;
}

function Need({ onSubmit, data }: PromptProps) {
  const [trust, setTrust] = useState(false);
  return (
    <form className="bg-gray-50" onSubmit={onSubmit(trust)}>
      <button type="submit" onClick={(e) => setTrust(false)}>
        Cancel
      </button>
      <button type="submit" onClick={(e) => setTrust(true)}>
        Trust
      </button>
    </form>
  );
}

function Prompt({ onSubmit, data }: PromptProps) {
  const [name, setName] = useState('');

  return (
    <form onSubmit={onSubmit(name)}>
      <div className="mt-1">
        <input
          type="text"
          name="prompt"
          id="prompt"
          className="shadow-sm focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border-gray-300 rounded-md"
          placeholder={data.message as string}
          autoFocus
          onChange={(e) => setName(e.currentTarget.value)}
        />
      </div>
    </form>
  );
}

export default function App() {
  const [data, setData]: any[] = useState({});
  useEffect(() => {
    ipcRenderer.on('prompt', (event, promptData: SimplePromptOptions) => {
      console.log(promptData);
      setData(promptData);
    });
  }, []);

  const onSubmit = (formData: any) => (event: FormEvent<HTMLFormElement>) => {
    console.log({ formData });
    event.preventDefault();
    console.log({ event });
    ipcRenderer.send('prompt', formData);
  };

  return (
    <>
      {data.from === 'need' && <Need onSubmit={onSubmit} data={data} />}
      {data.from === 'prompt' && <Prompt onSubmit={onSubmit} data={data} />}
    </>
  );
}
