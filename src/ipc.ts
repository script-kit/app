/* eslint-disable import/prefer-default-export */
/* eslint-disable no-restricted-syntax */
import { ipcMain } from 'electron';
import log from 'electron-log';
import { isUndefined } from 'lodash';
import { Channel, ProcessType } from 'kit-bridge/cjs/enum';
import { kitPath } from 'kit-bridge/cjs/util';
import { Script } from 'kit-bridge/cjs/type';
import { emitter, KitEvent } from './events';

import { processes } from './process';

import { escapePromptWindow, resizePromptHeight, reload } from './prompt';
import { setAppHidden, getAppHidden } from './appHidden';

export const getLogFromScriptPath = (filePath: string) => {
  return filePath.replace('scripts', 'logs').replace(/\.js$/, '.log');
};

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
    if (!getAppHidden()) {
      setTimeout(() => {
        reload();
        processes.add(ProcessType.App, kitPath('cli/kit-log.js'), []);
        escapePromptWindow();
      }, 3000);
    }
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

  ipcMain.on(Channel.CONTENT_HEIGHT_UPDATED, (event, heightAndCache) => {
    if (!isUndefined(heightAndCache)) {
      resizePromptHeight(heightAndCache);
    }
  });

  ipcMain.on(Channel.ESCAPE_PRESSED, async (event, { pid }) => {
    escapePromptWindow();
    processes.removeByPid(pid);
  });

  ipcMain.on(Channel.OPEN_SCRIPT_LOG, async (event, script: Script) => {
    processes.add(ProcessType.App, kitPath('cli/edit-file.js'), [
      getLogFromScriptPath(script.filePath),
    ]);
  });

  emitter.on(KitEvent.Blur, async () => {
    const promptProcessInfo = await processes.findPromptProcess();

    if (promptProcessInfo) {
      const { child, scriptPath } = promptProcessInfo;
      emitter.emit(KitEvent.ResumeShortcuts);

      if (child) {
        log.info(`🙈 Blur process: ${scriptPath} id: ${child.pid}`);
        child?.send({ channel: Channel.PROMPT_BLURRED });
      }
    }

    setAppHidden(false);
  });
};
