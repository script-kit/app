/* eslint-disable import/prefer-default-export */
/* eslint-disable no-restricted-syntax */
import { ipcMain } from 'electron';
import log from 'electron-log';
import { isUndefined } from 'lodash';
import { emitter, EVENT } from './events';

import {
  CHOICE_FOCUSED,
  GENERATE_CHOICES,
  PROMPT_ERROR,
  RESET_PROMPT,
  TAB_CHANGED,
  VALUE_SUBMITTED,
  CONTENT_SIZE_UPDATED,
  ESCAPE_PRESSED,
} from './channels';

import { processMap, ChildInfo } from './state';
import {
  escapePromptWindow,
  resizePrompt,
  sendToPrompt,
  hideEmitter,
  hidePromptWindow,
  setPlaceholder,
} from './prompt';
import { setAppHidden, getAppHidden } from './appHidden';

export const reset = (resetPid?: number) => {
  let mapPid = resetPid || 0;

  // only 'kit' scripts will cancel previous kit scripts
  if (!mapPid) {
    for (const [pid, value] of processMap.entries()) {
      if (value.from === 'kit') {
        mapPid = pid;
      }
    }
  }
  if (processMap.has(mapPid)) {
    const { child, scriptPath } = processMap.get(mapPid) as ChildInfo;

    emitter.emit(EVENT.RESUME_SHORTCUTS);
    sendToPrompt(RESET_PROMPT, { kitScript: scriptPath });

    child?.removeAllListeners();
    child?.kill();
  }

  setAppHidden(false);
};

hideEmitter.on('hide', () => {
  if (getAppHidden()) {
    setAppHidden(false);
  } else {
    reset();
    hidePromptWindow();
  }
});

ipcMain.on(VALUE_SUBMITTED, (_event, { value, pid }) => {
  if (processMap.has(pid)) {
    const { child, values } = processMap.get(pid) as ChildInfo;
    console.log(`PID CHECK:`, child?.pid, { pid, value });
    emitter.emit(EVENT.RESUME_SHORTCUTS);
    values.push(value);
    if (child) {
      child?.send({ channel: VALUE_SUBMITTED, value });
    }
  }
});

ipcMain.on(GENERATE_CHOICES, (_event, { input, pid }) => {
  if (processMap.has(pid)) {
    const { child } = processMap.get(pid) as ChildInfo;

    if (child && !isUndefined(input)) {
      child?.send({ channel: GENERATE_CHOICES, input });
    }
  }
});

ipcMain.on(PROMPT_ERROR, (_event, { error }) => {
  log.warn(error);
  if (!getAppHidden()) setPlaceholder(error.message);
});

ipcMain.on(CHOICE_FOCUSED, (_event, choice: any) => {
  // TODO: Think through "live selecting" choices
  // child?.send({ channel: CHOICE_FOCUSED, choice });
});

ipcMain.on(TAB_CHANGED, (event, { tab, input = '', pid }) => {
  emitter.emit(EVENT.RESUME_SHORTCUTS);
  if (processMap.has(pid)) {
    const { child } = processMap.get(pid) as ChildInfo;
    if (child && tab) {
      child?.send({ channel: TAB_CHANGED, tab, input });
    }
  }
});

ipcMain.on(CONTENT_SIZE_UPDATED, (event, size) => {
  if (!isUndefined(size)) {
    resizePrompt(size);
  }
});

ipcMain.on(ESCAPE_PRESSED, (event, { pid }) => {
  reset(pid);
  escapePromptWindow();
});
