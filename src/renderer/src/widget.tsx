import log from 'electron-log/renderer';

log.info(`
---------------------------
📺 Widget renderer process started
---------------------------
`);

window.addEventListener('unhandledrejection', (event) => {
  log.error('Unhandled promise rejection: ', event.reason);
});

window.addEventListener('error', (event) => {
  log.error('Uncaught exception: ', event.error);
});

window.addEventListener('uncaughtException', (error) => {
  log.error('Uncaught exception: ', error);
});

window.addEventListener('uncaughtExceptionMonitor', (error) => {
  log.error('Uncaught exception monitor: ', error);
});

window.addEventListener('warning', (warning) => {
  log.warn('Warning: ', warning);
});

import { createRoot } from 'react-dom/client';
import App from './AppWidget';
import './assets/index.css';

const container = document.getElementById('root');

const root = createRoot(container as Element);
root.render(<App />);
