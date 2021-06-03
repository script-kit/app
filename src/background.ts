import { grep } from 'shelljs';
import log from 'electron-log';

import { Channel } from './enums';
import { emitter } from './events';
import { backgroundMap, Background } from './state';
import { runBackgroundScript } from './kit';

const backgroundMarker = 'Background: ';

export const removeBackground = (filePath: string) => {
  if (backgroundMap.get(filePath)) {
    const { child } = backgroundMap.get(filePath) as Background;
    backgroundMap.delete(filePath);

    log.info(`> kill background process: ${filePath} ${child?.pid}`);
    child?.kill();
  }
};

export const updateBackground = (filePath: string, fileChange = false) => {
  const { stdout } = grep(backgroundMarker, filePath);

  const backgroundString = stdout
    .substring(0, stdout.indexOf('\n'))
    .substring(stdout.indexOf(backgroundMarker) + backgroundMarker.length)
    .trim();

  const startTask = () => {
    const child = runBackgroundScript(filePath, []);
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

emitter.on(Channel.TOGGLE_BACKGROUND, (data) => {
  toggleBackground(data.filePath as string);
});
