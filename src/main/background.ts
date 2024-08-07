import type { Channel } from '@johnlindquist/kit/core/enum';
import { parseScript } from '@johnlindquist/kit/core/utils';
import type { Script } from '@johnlindquist/kit/types/core';
import type { SendData } from '@johnlindquist/kit/types/kitapp';
import { Trigger } from '../shared/enums';
import { KitEvent, emitter } from '../shared/events';
import { runPromptProcess } from './kit';
import { processes } from './process';
import { type Background, backgroundMap, kitState } from './state';
import { createLogger } from '../shared/log-utils';

const log = createLogger('background.ts');

export const removeBackground = (filePath: string) => {
  if (!filePath) {
    return;
  }

  const background = backgroundMap.get(filePath);

  if (background && background.status === 'ready') {
    const { child } = backgroundMap.get(filePath) as Background;

    log.info('Removing background task. Checking pid:', child?.pid);
    backgroundMap.delete(filePath);
    if (child?.pid) {
      log.red('Removing background task', filePath);
      processes.removeByPid(child.pid);
    }
  } else {
    log.info(`Background task starting up, skip removing...`);
  }
};

export const startBackgroundTask = async (filePath: string, args: string[] = []) => {
  const background = backgroundMap.get(filePath);
  log.info(`Checking background`, background, backgroundMap.entries());
  if (background && background.child === null) {
    log.info('Background already starting up. Ignoring...', filePath);
    return;
  }

  if (background) {
    log.info('Found background task with child, removing', filePath);
    if (background.child) {
      removeBackground(filePath);
    }
  }

  log.info('🌕 Starting background task', filePath);
  backgroundMap.set(filePath, {
    start: new Date().toString(),
    child: null,
    status: 'starting',
  });
  log.info('🌕 Starting background task set', backgroundMap.get(filePath));

  const processInfo = await runPromptProcess(filePath, args, {
    force: false,
    trigger: Trigger.Background,
    sponsorCheck: false,
  });

  if (processInfo) {
    const { child } = processInfo;

    log.info('🟢 Background task started', filePath);

    backgroundMap.set(filePath, {
      start: new Date().toString(),
      child,
      status: 'ready',
    });
  } else {
    log.info('Background task not running', filePath, processInfo);
  }
};

export const backgroundScriptChanged = ({ filePath, kenv, background: backgroundString }: Script) => {
  removeBackground(filePath);
  if (kenv !== '' && !kitState.trustedKenvs.includes(kenv)) {
    if (backgroundString) {
      log.info(`Ignoring ${filePath} // Background metadata because it's not trusted in a trusted kenv.`);
      log.info(`Add "${kitState.trustedKenvsKey}=${kenv}" to your .env file to trust it.`);
    }

    return;
  }

  if (backgroundString === 'auto') {
    log.info(`Auto-starting background task for ${filePath}`);
    startBackgroundTask(filePath);
  }
};

export const updateBackground = async (filePath: string, fileChange = false) => {
  const script = await parseScript(filePath);
  const backgroundString = script?.background;

  // Task not running. File not changed
  const isTrue = typeof backgroundString === 'boolean' && backgroundString;
  if (!backgroundMap.get(filePath) && (isTrue || backgroundString === 'auto') && !fileChange) {
    log.info(`Task not running. File not changed. Starting background task for ${filePath}`);
    startBackgroundTask(filePath);
    return;
  }

  // Task running. File changed
  if (backgroundMap.get(filePath) && backgroundString === 'auto') {
    log.info(`Task running. File changed. Restarting background task for ${filePath}`);
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

emitter.on(KitEvent.ToggleBackground, async (data: SendData<Channel.TOGGLE_BACKGROUND>) => {
  await toggleBackground(data.value as string);
});

emitter.on(KitEvent.RemoveProcess, removeBackground);
