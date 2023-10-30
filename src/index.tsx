/* eslint-disable import/first */
import log from 'electron-log/renderer';

log.info(`
---------------------------
📺 Renderer process started
---------------------------
`);

import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './App.global.css';

const container = document.getElementById('root');

const root = createRoot(container as Element);
root.render(<App />);
