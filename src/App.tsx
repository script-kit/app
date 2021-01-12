/* eslint-disable jsx-a11y/no-autofocus */
/* eslint-disable jsx-a11y/label-has-associated-control */
import React, { FormEvent, useEffect, useState } from 'react';
import { ipcRenderer, nativeTheme } from 'electron';
import { SimplePromptOptions } from './types';

export default function Prompt() {
  const [name, setName] = useState('');
  const [message, setMessage] = useState('');
  useEffect(() => {
    ipcRenderer.on('prompt', (event, data: SimplePromptOptions) => {
      setMessage(data.message as string);
    });
  }, []);

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    console.log({ event });
    ipcRenderer.send('prompt', name);
  };

  return (
    <form onSubmit={onSubmit}>
      <div className="mt-1">
        <input
          type="text"
          name="prompt"
          id="prompt"
          className="shadow-sm focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border-gray-300 rounded-md"
          placeholder={message}
          autoFocus
          onChange={(e) => setName(e.currentTarget.value)}
        />
      </div>
    </form>
  );
}
