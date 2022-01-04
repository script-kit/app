/* eslint-disable no-nested-ternary */
/* eslint-disable import/prefer-default-export */
/* eslint-disable no-restricted-syntax */
import { ipcMain } from 'electron';
import log from 'electron-log';
import { debounce } from 'lodash';
import { Channel, ProcessType } from '@johnlindquist/kit/cjs/enum';
import {
  kitPath,
  getLogFromScriptPath,
  tmpDownloadsDir,
  mainScriptPath,
} from '@johnlindquist/kit/cjs/utils';
import { AppMessage } from '@johnlindquist/kit/types/kitapp';
import { Script } from '@johnlindquist/kit/types/core';
import { existsSync, renameSync } from 'fs';
import isImage from 'is-image';
import { DownloaderHelper } from 'node-downloader-helper';
import detect from 'detect-file-type';
import { emitter, KitEvent } from './events';

import { processes, ProcessInfo } from './process';

import {
  escapePromptWindow,
  focusPrompt,
  reload,
  resize,
  setIgnoreBlur,
} from './prompt';
import { setAppHidden, getAppHidden } from './appHidden';
import { runPromptProcess } from './kit';
import { AppChannel } from './enums';
import { ResizeData } from './types';
import { getAssetPath } from './assets';

const handleChannel =
  (fn: (processInfo: ProcessInfo, message: AppMessage) => void) =>
  (_event: any, message: AppMessage) => {
    const processInfo = processes.getByPid(message?.pid);

    if (processInfo) {
      fn(processInfo, message);
    } else {
      console.warn(`⚠️ IPC failed on pid ${message?.pid}`);
      console.log(message);
    }
  };

export const startIpc = () => {
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

  ipcMain.on(AppChannel.RESIZE, (event, resizeData: ResizeData) => {
    resize(resizeData);
  });

  ipcMain.on(Channel.ESCAPE_PRESSED, async (event, message) => {
    processes.removeByPid(message.pid);
    emitter.emit(KitEvent.ResumeShortcuts);

    if (!message.newPid) {
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

  ipcMain.on(AppChannel.FOCUS_PROMPT, () => {
    focusPrompt();
  });

  for (const channel of [
    Channel.INPUT,
    Channel.CHOICE_FOCUSED,
    Channel.CHOICES,
    Channel.NO_CHOICES,
    Channel.BACK,
    Channel.FORWARD,
    Channel.UP,
    Channel.DOWN,
    Channel.TAB,
    Channel.ESCAPE,
    Channel.VALUE_SUBMITTED,
    Channel.TAB_CHANGED,
  ]) {
    // log.info(`😅 Registering ${channel}`);
    ipcMain.on(
      channel,
      handleChannel(({ child }, message) => {
        // log.info({ channel, message });
        if ([Channel.VALUE_SUBMITTED, Channel.TAB_CHANGED].includes(channel)) {
          emitter.emit(KitEvent.ResumeShortcuts);
        }

        if (channel === Channel.VALUE_SUBMITTED) {
          setIgnoreBlur(false);
        }

        if (child) {
          child?.send(message);
        }
      })
    );
  }
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
