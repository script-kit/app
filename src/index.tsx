import React from 'react';
import { createRoot } from 'react-dom/client';
import log from 'electron-log';
import App from './App';
import './App.global.css';

const container = document.getElementById('root');

const root = createRoot(container as Element);
root.render(<App />);

(window as any).tick = async () => {
  root.render(<App />);
  if (log) {
    log.info('<App /> rendered ✅');
  }
  return Promise.resolve();
};
