/* eslint-disable import/prefer-default-export */
/* eslint-disable no-restricted-syntax */
import { ipcMain } from 'electron';
import log from 'electron-log';
import { isUndefined } from 'lodash';
import { Channel } from 'kit-bridge/cjs/enum';
import { emitter, KitEvent } from './events';

import { processes } from './process';

import {
  escapePromptWindow,
  resizePromptHeight,
  setPlaceholder,
} from './prompt';
import { setAppHidden, getAppHidden } from './appHidden';

export const startIpc = () => {
  ipcMain.on(Channel.VALUE_SUBMITTED, (_event, { value, pid }) => {
    processes.ifPid(pid, ({ child, values }) => {
      emitter.emit(KitEvent.ResumeShortcuts);
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
    emitter.emit(KitEvent.ResumeShortcuts);
    processes.ifPid(pid, ({ child }) => {
      if (child && tab) {
        child?.send({ channel: Channel.TAB_CHANGED, tab, input });
      }
    });
  });

  ipcMain.on(Channel.CONTENT_HEIGHT_UPDATED, (event, height) => {
    if (!isUndefined(height)) {
      resizePromptHeight(height);
    }
  });

  ipcMain.on(Channel.ESCAPE_PRESSED, async (event, { pid }) => {
    escapePromptWindow();

    processes.removeByPid(pid);
  });

  emitter.on(KitEvent.Blur, async () => {
    const promptProcessInfo = await processes.findPromptProcess();

    if (promptProcessInfo) {
      const { child, scriptPath } = promptProcessInfo;
      emitter.emit(KitEvent.ResumeShortcuts);

      log.info(`🙈 Blur process: ${scriptPath} id: ${child.pid}`);
      if (child) {
        child?.send({ channel: Channel.PROMPT_BLURRED });
      }
    }

    setAppHidden(false);
  });
};
