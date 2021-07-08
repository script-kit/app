import log from 'electron-log';

import { ProcessType } from 'kit-bridge/cjs/enum';
import { info } from 'kit-bridge/cjs/util';
import { Script } from 'kit-bridge/cjs/type';
import { emitter, KitEvent } from './events';
import { backgroundMap, Background } from './state';
import { processes } from './process';

export const removeBackground = (filePath: string) => {
  if (backgroundMap.get(filePath)) {
    const { child } = backgroundMap.get(filePath) as Background;
    backgroundMap.delete(filePath);

    log.info(`> kill background process: ${filePath} ${child?.pid}`);
    child?.kill();
  }
};

export const backgroundScriptChanged = ({
  filePath,
  background: backgroundString,
}: Script) => {
  const startTask = () => {
    const { child } = processes.add(ProcessType.Background, filePath);
    backgroundMap.set(filePath, {
      start: new Date().toString(),
      child,
    });
  };

  // Task running. File changed
  if (backgroundMap.get(filePath)) {
    if (backgroundString === 'auto') removeBackground(filePath);
    startTask();
  }
};

export const updateBackground = async (
  filePath: string,
  fileChange = false
) => {
  const { background: backgroundString } = await info(filePath);

  const startTask = () => {
    const { child } = processes.add(ProcessType.Background, filePath);
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

export const toggleBackground = async (filePath: string) => {
  if (backgroundMap.get(filePath)) {
    removeBackground(filePath);
  } else {
    await updateBackground(filePath);
  }
};

emitter.on(KitEvent.ToggleBackground, async (data) => {
  await toggleBackground(data.filePath as string);
});
