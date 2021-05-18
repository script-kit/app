import { grep } from 'shelljs';
import log from 'electron-log';

import { createMessageHandler } from './messages';
import { TOGGLE_BACKGROUND } from './channels';
import { emitter } from './events';
import { backgroundMap, Background } from './state';
import { createChild } from './run';

const backgroundMarker = 'Background: ';

export const removeBackground = (filePath: string) => {
  if (backgroundMap.get(filePath)) {
    const { child } = backgroundMap.get(filePath) as Background;
    backgroundMap.delete(filePath);

    log.info(`> kill background process: ${filePath} ${child?.pid}`);
    child?.kill();
  }
};

export const backgroundScript = (scriptPath: string, runArgs: string[]) => {
  const child = createChild({
    from: 'background',
    scriptPath,
    runArgs,
  });

  const pid = child?.pid;
  child?.on('exit', () => {
    if (backgroundMap.get(scriptPath)?.child?.pid === pid) {
      backgroundMap.delete(scriptPath);
    }
  });

  child?.on('message', createMessageHandler('background'));

  return child;
};

export const updateBackground = (filePath: string, fileChange = false) => {
  const { stdout } = grep(backgroundMarker, filePath);

  const backgroundString = stdout
    .substring(0, stdout.indexOf('\n'))
    .substring(stdout.indexOf(backgroundMarker) + backgroundMarker.length)
    .trim();

  const startTask = () => {
    const child = backgroundScript(filePath, []);
    backgroundMap.set(filePath, {
      start: new Date().toString(),
      child,
    });
  };

  // Task not running. File not changed
  if (
    !backgroundMap.get(filePath) &&
    (backgroundString === 'true' || backgroundString === 'auto') &&
    !fileChange
  ) {
    startTask();
    return;
  }

  // Task running. File changed
  if (backgroundMap.get(filePath) && backgroundString === 'auto') {
    removeBackground(filePath);
    startTask();
  }
};

export const toggleBackground = (filePath: string) => {
  if (backgroundMap.get(filePath)) {
    removeBackground(filePath);
  } else {
    updateBackground(filePath);
  }
};

emitter.on(TOGGLE_BACKGROUND, (data) => {
  toggleBackground(data.filePath as string);
});
