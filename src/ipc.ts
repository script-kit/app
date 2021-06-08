/* eslint-disable import/prefer-default-export */
/* eslint-disable no-restricted-syntax */
import { ipcMain } from 'electron';
import log from 'electron-log';
import { isUndefined } from 'lodash';
import { emitter, AppEvent } from './events';

import { processes, ProcessInfo } from './state';
import {
  escapePromptWindow,
  promptEmitter,
  PromptEvent,
  resizePrompt,
  setPlaceholder,
} from './prompt';
import { setAppHidden, getAppHidden } from './appHidden';
import { Channel, ProcessType } from './enums';

export const reset = (resetPid?: number) => {
  // let mapPid = resetPid || 0;

  // // only 'ProcessType.Prompt' scripts will cancel previous kit scripts
  // if (!mapPid) {
  //   for (const [pid, value] of processMap.entries()) {
  //     if (value.type === ProcessType.Prompt) {
  //       mapPid = pid;
  //     }
  //   }
  // }

  // if (processMap.has(mapPid)) {
  //   const { child, scriptPath } = processMap.get(mapPid) as ProcessInfo;

  //   emitter.emit(AppEvent.RESUME_SHORTCUTS);
  //   // sendToPrompt(Channel.RESET_PROMPT, { kitScript: scriptPath });

  //   child?.removeAllListeners();

  //   child?.kill();
  //   log.info(`🛑 kill process: ${scriptPath} id: ${child.pid}`);
  //   processMap.delete(mapPid);
  // }

  emitter.emit(AppEvent.RESUME_SHORTCUTS);
  setAppHidden(false);
};

ipcMain.on(Channel.VALUE_SUBMITTED, (_event, { value, pid }) => {
  processes.ifPid(pid, ({ child, values }) => {
    // console.log(`PID CHECK:`, child?.pid, { pid, value });
    emitter.emit(AppEvent.RESUME_SHORTCUTS);
    values.push(value);
    if (child) {
      child?.send({ channel: Channel.VALUE_SUBMITTED, value });
    }
  });
});

ipcMain.on(Channel.GENERATE_CHOICES, (_event, { input, pid }) => {
  processes.ifPid(pid, ({ child }) => {
    if (child && !isUndefined(input)) {
      child?.send({ channel: Channel.GENERATE_CHOICES, input });
    }
  });
});

ipcMain.on(Channel.PROMPT_ERROR, (_event, { error }) => {
  log.warn(error);
  if (!getAppHidden()) setPlaceholder(error.message);
});

ipcMain.on(Channel.CHOICE_FOCUSED, (_event, { index, pid }) => {
  processes.ifPid(pid, ({ child }) => {
    if (child && !isUndefined(index)) {
      child?.send({ channel: Channel.CHOICE_FOCUSED, index });
    }
  });
});

ipcMain.on(Channel.TAB_CHANGED, (event, { tab, input = '', pid }) => {
  emitter.emit(AppEvent.RESUME_SHORTCUTS);
  processes.ifPid(pid, ({ child }) => {
    if (child && tab) {
      child?.send({ channel: Channel.TAB_CHANGED, tab, input });
    }
  });
});

ipcMain.on(Channel.CONTENT_SIZE_UPDATED, (event, size) => {
  if (!isUndefined(size)) {
    resizePrompt(size);
  }
});

ipcMain.on(Channel.ESCAPE_PRESSED, (event, { pid }) => {
  // reset(pid);
  escapePromptWindow();
});

// const getPromptProcessChildInfo = () => {
//   log.info(
//     Array.from(processMap.values()).map(({ child, scriptPath }) => ({
//       scriptPath,
//       id: child.pid,
//     }))
//   );
//   const processEntry: [number, ChildInfo] | undefined = Array.from(
//     processMap.entries()
//   ).find(([_, value]) => value.type === ProcessType.Prompt && value.scriptPath);

//   return processEntry?.[1];
// };

promptEmitter.on(PromptEvent.Blur, () => {
  const promptProcessInfo = processes.findPromptProcess();

  if (promptProcessInfo) {
    const { child, scriptPath } = promptProcessInfo;
    log.info(`Blurred ${child.pid} - ${scriptPath}`);

    emitter.emit(AppEvent.RESUME_SHORTCUTS);

    log.info(`🙈 blurred process: ${scriptPath} id: ${child.pid}`);
    if (child) {
      child?.send({ channel: Channel.PROMPT_BLURRED });
    }
  }

  setAppHidden(false);
});
