import log from 'electron-log';

import { ProcessType, Channel } from '@johnlindquist/kit/cjs/enum';
import { parseScript } from '@johnlindquist/kit/cjs/utils';
import { SendData } from '@johnlindquist/kit/types/kitapp';
import { Script } from '@johnlindquist/kit/types/core';
import { emitter, KitEvent } from './events';
import { backgroundMap, Background } from './state';
import { processes } from './process';
import { runPromptProcess } from './kit';

export const removeBackground = (filePath: string) => {
  log.info(`Removing background process ${filePath}`);
  if (backgroundMap.get(filePath)) {
    const { child } = backgroundMap.get(filePath) as Background;
    backgroundMap.delete(filePath);

    if (child && !child?.killed) {
      log.info(`> kill background process: ${filePath} ${child?.pid}`);
      child?.kill();
    }
  }
};

const startTask = async (filePath: string) => {
  const processInfo = await runPromptProcess(filePath);
  if (processInfo) {
    const { child } = processInfo;
    backgroundMap.set(filePath, {
      start: new Date().toString(),
      child,
    });
  }
};

export const backgroundScriptChanged = ({
  filePath,
  kenv,
  background: backgroundString,
}: Script) => {
  if (kenv !== '') return;

  // Task running. File changed
  if (backgroundMap.get(filePath)) {
    if (!backgroundString) {
      removeBackground(filePath);
      return;
    }
    if (backgroundString === 'auto') removeBackground(filePath);
    startTask(filePath);
  } else if (backgroundString === 'auto') {
    startTask(filePath);
  }
};

export const updateBackground = async (
  filePath: string,
  fileChange = false
) => {
  const { background: backgroundString } = await parseScript(filePath);

  // Task not running. File not changed
  if (
    !backgroundMap.get(filePath) &&
    (backgroundString === 'true' || backgroundString === 'auto') &&
    !fileChange
  ) {
    startTask(filePath);
    return;
  }

  // Task running. File changed
  if (backgroundMap.get(filePath) && backgroundString === 'auto') {
    removeBackground(filePath);
    startTask(filePath);
  }
};

export const toggleBackground = async (filePath: string) => {
  if (backgroundMap.get(filePath)) {
    removeBackground(filePath);
  } else {
    await updateBackground(filePath);
  }
};

emitter.on(
  KitEvent.ToggleBackground,
  async (data: SendData<Channel.TOGGLE_BACKGROUND>) => {
    await toggleBackground(data.value as string);
  }
);

emitter.on(KitEvent.RemoveBackground, removeBackground);
