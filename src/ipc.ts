/* eslint-disable no-nested-ternary */
/* eslint-disable import/prefer-default-export */
/* eslint-disable no-restricted-syntax */
import { ipcMain } from 'electron';
import log from 'electron-log';
import { debounce, isUndefined } from 'lodash';
import { Channel, ProcessType } from '@johnlindquist/kit/cjs/enum';
import {
  kitPath,
  getLogFromScriptPath,
  tmpDownloadsDir,
  mainScriptPath,
} from '@johnlindquist/kit/cjs/utils';
import { Script } from '@johnlindquist/kit/types/core';
import { MessageData } from '@johnlindquist/kit/types/kitapp';
import { existsSync, renameSync } from 'fs';
import isImage from 'is-image';
import { DownloaderHelper } from 'node-downloader-helper';
import detect from 'detect-file-type';
import { emitter, KitEvent } from './events';

import { processes, ProcessInfo } from './process';

import { escapePromptWindow, reload, resize, setIgnoreBlur } from './prompt';
import { setAppHidden, getAppHidden } from './appHidden';
import { runPromptProcess } from './kit';
import { AppChannel } from './enums';
import { ResizeData } from './types';
import { getAssetPath } from './assets';

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
    handleChannel(({ child, values }, { value, pid, flag, id }) => {
      emitter.emit(KitEvent.ResumeShortcuts);
      setIgnoreBlur(false);
      values.push(value);
      if (child) {
        child?.send({ channel: Channel.VALUE_SUBMITTED, value, flag, pid, id });
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

  ipcMain.on(
    Channel.CHOICES,
    handleChannel(({ child }, { input }) => {
      if (child && !isUndefined(input)) {
        child?.send({ channel: Channel.CHOICES, input });
      }
    })
  );

  ipcMain.on(
    Channel.NO_CHOICES,
    handleChannel(({ child }, { input }) => {
      if (child && !isUndefined(input)) {
        child?.send({ channel: Channel.NO_CHOICES, input });
      }
    })
  );

  ipcMain.on(
    Channel.PROMPT_ERROR,
    debounce((_event, { error }) => {
      log.warn(error);
      if (!getAppHidden()) {
        setTimeout(() => {
          reload();
          processes.add(ProcessType.App, kitPath('cli/kit-log.js'), []);
          escapePromptWindow();
        }, 3000);
      }
    }, 1000)
  );

  ipcMain.on(
    Channel.CHOICE_FOCUSED,

    handleChannel(({ child }, { id, pid, input = '' }) => {
      if (child && !isUndefined(id)) {
        child?.send({ channel: Channel.CHOICE_FOCUSED, id, pid, input });
      }
    })
  );

  ipcMain.on(
    Channel.TAB_CHANGED,
    handleChannel(({ child }, { tab, input = '', pid }) => {
      emitter.emit(KitEvent.ResumeShortcuts);

      if (child && tab) {
        log.info(`TAB_CHANGED:`, { tab, input, pid });
        child?.send({ channel: Channel.TAB_CHANGED, tab, input, pid });
      }
    })
  );

  ipcMain.on(AppChannel.RESIZE, (event, resizeData: ResizeData) => {
    resize(resizeData);
  });

  ipcMain.on(Channel.ESCAPE_PRESSED, async (event, { pid, newPid }) => {
    processes.removeByPid(pid);
    emitter.emit(KitEvent.ResumeShortcuts);

    if (!newPid) {
      escapePromptWindow();
      setAppHidden(false);
      emitter.emit(KitEvent.ExitPrompt);
    }
  });

  ipcMain.on(Channel.OPEN_SCRIPT_LOG, async (event, script: Script) => {
    const filePath = getLogFromScriptPath(script.filePath);
    await runPromptProcess(kitPath('cli/edit-file.js'), [filePath]);
  });

  ipcMain.on(Channel.OPEN_SCRIPT, async (event, script: Script) => {
    if (script.filePath?.startsWith(kitPath())) return;
    await runPromptProcess(kitPath('cli/edit-file.js'), [script.filePath]);
  });

  ipcMain.on(Channel.EDIT_SCRIPT, async (event, filePath: string) => {
    if (filePath?.startsWith(kitPath())) return;
    await runPromptProcess(kitPath('main/edit.js'), [filePath]);
  });

  ipcMain.on(Channel.OPEN_FILE, async (event, filePath: string) => {
    await runPromptProcess(kitPath('cli/edit-file.js'), [filePath]);
  });

  ipcMain.on(AppChannel.RUN_MAIN_SCRIPT, async () => {
    runPromptProcess(mainScriptPath);
  });

  // ipcMain.on(
  //   Channel.SET_PREVIEW_ENABLED,
  //   async (event, previewEnabled: boolean) => {
  //     setPreviewEnabled(previewEnabled);
  //   }
  // );

  ipcMain.on(
    AppChannel.DRAG_FILE_PATH,
    async (event, { filePath, icon }: { filePath: string; icon: string }) => {
      try {
        let newPath = filePath;
        if (filePath.startsWith('http')) {
          newPath = await new Promise((resolve, reject) => {
            const dl = new DownloaderHelper(filePath, tmpDownloadsDir, {
              override: true,
            });
            dl.on('end', (info) => {
              const fp = info.filePath;
              detect.fromFile(
                fp,
                (err: any, result: { ext: string; mime: string }) => {
                  if (err) {
                    throw err;
                  }
                  if (!fp.endsWith(result.ext)) {
                    const fixedFilePath = `${fp}.${result.ext}`;
                    renameSync(fp, fixedFilePath);
                    resolve(fixedFilePath);
                  } else {
                    resolve(fp);
                  }
                }
              );
            });
            dl.start();
          });
        }

        if (existsSync(newPath)) {
          const pickIcon = isImage(newPath)
            ? newPath.endsWith('.gif') || newPath.endsWith('.svg')
              ? getAssetPath('icons8-image-file-24.png')
              : newPath
            : getAssetPath('icons8-file-48.png');
          event.sender.startDrag({
            file: newPath,
            icon: pickIcon,
          });
        }
      } catch (error) {
        log.warn(error);
      }
    }
  );

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
