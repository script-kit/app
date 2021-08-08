/* eslint-disable import/prefer-default-export */
/* eslint-disable no-restricted-syntax */
import { ipcMain } from 'electron';
import log from 'electron-log';
import { debounce, isUndefined } from 'lodash';
import { Channel, ProcessType } from 'kit-bridge/cjs/enum';
import { kitPath, getLogFromScriptPath } from 'kit-bridge/cjs/util';
import { MessageData, Script } from 'kit-bridge/cjs/type';
import { emitter, KitEvent } from './events';

import { processes, ProcessInfo } from './process';

import {
  escapePromptWindow,
  resizePromptHeight,
  reload,
  resetPromptBounds,
} from './prompt';
import { setAppHidden, getAppHidden } from './appHidden';
import { runPromptProcess } from './kit';
import { AppChannel } from './enums';

const handleChannel =
  (fn: (processInfo: ProcessInfo, data: any) => void) =>
  (_event: any, data: MessageData) => {
    const processInfo = processes.getByPid(data?.pid);

    if (processInfo) {
      fn(processInfo, data);
    } else {
      console.warn(`⚠️ IPC failed on pid ${data?.pid}`);
      console.log(data);
    }
  };

export const startIpc = () => {
  ipcMain.on(
    Channel.VALUE_SUBMITTED,
    handleChannel(({ child, values }, { value, pid, flag }) => {
      emitter.emit(KitEvent.ResumeShortcuts);
      values.push(value);
      if (child) {
        child?.send({ channel: Channel.VALUE_SUBMITTED, value, flag });
      }
    })
  );

  ipcMain.on(
    Channel.GENERATE_CHOICES,
    handleChannel(({ child }, { input }) => {
      if (child && !isUndefined(input)) {
        child?.send({ channel: Channel.GENERATE_CHOICES, input });
      }
    })
  );

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

  ipcMain.on(
    Channel.CHOICE_FOCUSED,
    handleChannel(({ child }, { index, pid }) => {
      if (child && !isUndefined(index)) {
        child?.send({ channel: Channel.CHOICE_FOCUSED, index });
      }
    })
  );

  ipcMain.on(
    Channel.TAB_CHANGED,
    handleChannel(({ child }, { tab, input = '', pid }) => {
      emitter.emit(KitEvent.ResumeShortcuts);

      if (child && tab) {
        child?.send({ channel: Channel.TAB_CHANGED, tab, input });
      }
    })
  );

  ipcMain.on(
    Channel.CONTENT_HEIGHT_UPDATED,
    debounce((event, heightAndUi) => {
      resizePromptHeight(heightAndUi);
    }, 44)
  );

  ipcMain.on(AppChannel.INIT_RESIZE_HEIGHT, (event, heightAndUi) => {
    resizePromptHeight(heightAndUi);
  });

  ipcMain.on(AppChannel.PROMPT_HEIGHT_RESET, (event) => {
    resetPromptBounds();
  });

  ipcMain.on(Channel.ESCAPE_PRESSED, async (event, { pid }) => {
    escapePromptWindow();
    processes.removeByPid(pid);
  });

  ipcMain.on(Channel.OPEN_SCRIPT_LOG, async (event, script: Script) => {
    const filePath = getLogFromScriptPath(script.filePath);
    await runPromptProcess(kitPath('cli/edit-file.js'), [filePath]);
  });

  ipcMain.on(Channel.OPEN_SCRIPT, async (event, script: Script) => {
    if (script.filePath.startsWith(kitPath())) return;
    await runPromptProcess(kitPath('cli/edit-file.js'), [script.filePath]);
  });

  ipcMain.on(Channel.EDIT_SCRIPT, async (event, filePath: string) => {
    if (filePath.startsWith(kitPath())) return;
    await runPromptProcess(kitPath('main/edit.js'), [filePath]);
  });

  ipcMain.on(Channel.OPEN_FILE, async (event, filePath: string) => {
    await runPromptProcess(kitPath('cli/edit-file.js'), [filePath]);
  });

  emitter.on(KitEvent.Blur, async () => {
    const promptProcessInfo = await processes.findPromptProcess();

    if (promptProcessInfo && promptProcessInfo.scriptPath) {
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
