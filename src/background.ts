import log from 'electron-log';
import { Channel } from '@johnlindquist/kit/cjs/enum';
import { parseScript } from '@johnlindquist/kit/cjs/utils';
import { SendData } from '@johnlindquist/kit/types/kitapp';
import { Script } from '@johnlindquist/kit/types/core';
import { emitter, KitEvent } from './events';
import { backgroundMap, Background, kitState } from './state';
import { processes } from './process';
import { runPromptProcess } from './kit';
import { Trigger } from './enums';

export const removeBackground = (filePath: string) => {
  if (!filePath) return;
  if (backgroundMap.get(filePath)) {
    const { child } = backgroundMap.get(filePath) as Background;
    backgroundMap.delete(filePath);

    log.info('Removing background task', filePath);
    processes.removeByPid(child.pid);
  }
};

export const startBackgroundTask = async (
  filePath: string,
  args: string[] = []
) => {
  removeBackground(filePath);
  if (filePath.endsWith('.ts')) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  const processInfo = await runPromptProcess(filePath, args, {
    force: false,
    trigger: Trigger.Background,
  });
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
  removeBackground(filePath);
  if (kenv !== '' && !kitState.trustedKenvs.includes(kenv)) {
    if (backgroundString) {
      log.info(
        `Ignoring ${filePath} // Background metadata because it's not trusted in a trusted kenv.`
      );
      log.info(
        `Add "${kitState.trustedKenvsKey}=${kenv}" to your .env file to trust it.`
      );
    }

    return;
  }

  if (backgroundString === 'auto') {
    startBackgroundTask(filePath);
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
    startBackgroundTask(filePath);
    return;
  }

  // Task running. File changed
  if (backgroundMap.get(filePath) && backgroundString === 'auto') {
    removeBackground(filePath);
    startBackgroundTask(filePath);
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

emitter.on(KitEvent.RemoveProcess, removeBackground);
