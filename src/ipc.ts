/* eslint-disable no-nested-ternary */
/* eslint-disable import/prefer-default-export */
/* eslint-disable no-restricted-syntax */
import { clipboard, ipcMain } from 'electron';
import log from 'electron-log';
import { format } from 'date-fns';
import { ensureDir } from 'fs-extra';
import path from 'path';
import { debounce } from 'lodash';
import axios from 'axios';
import { Script } from '@johnlindquist/kit';
import { Channel } from '@johnlindquist/kit/cjs/enum';
import {
  kitPath,
  getLogFromScriptPath,
  tmpDownloadsDir,
  mainScriptPath,
  isInDir,
  kenvPath,
  isFile,
} from '@johnlindquist/kit/cjs/utils';
import { ProcessInfo } from '@johnlindquist/kit/types/core';
import { AppMessage, AppState } from '@johnlindquist/kit/types/kitapp';
import { existsSync, renameSync } from 'fs';
import { writeFile } from 'fs/promises';
import isImage from 'is-image';
import { DownloaderHelper } from 'node-downloader-helper';
import detect from 'detect-file-type';
import { emitter, KitEvent } from './events';
import { processes } from './process';

import {
  endPrompt,
  focusPrompt,
  isFocused,
  reload,
  resize,
  showInactive,
} from './prompt';
import { runPromptProcess } from './kit';
import { AppChannel } from './enums';
import { ResizeData, Survey } from './types';
import { getAssetPath } from './assets';
import { kitConfig, kitState, updateScripts } from './state';

const handleChannel = (
  fn: (processInfo: ProcessInfo, message: AppMessage) => void
) => (_event: any, message: AppMessage) => {
  // log.info(message);
  const processInfo = processes.getByPid(message?.pid);

  if (processInfo) {
    fn(processInfo, message);
    // log.info(`${message.channel}`, message.pid);
  } else {
    log.warn(`${message.channel} failed on ${message?.pid}`, message);

    // log.warn(processInfo?.child, processInfo?.type);
    // console.log(message);
  }
};

export const startIpc = () => {
  ipcMain.on(
    Channel.PROMPT_ERROR,
    debounce((_event, { error }) => {
      log.warn(error);
      if (!kitState.hidden) {
        setTimeout(() => {
          reload();
          // processes.add(ProcessType.App, kitPath('cli/kit-log.js'), []);
          // escapePromptWindow();
        }, 3000);
      }
    }, 1000)
  );

  ipcMain.on(AppChannel.GET_ASSET, (event, { parts }) => {
    log.info(`📁 GET_ASSET ${parts.join('/')}`);
    const assetPath = getAssetPath(...parts);
    log.info(`📁 Asset path: ${assetPath}`);
    event.sender.send(AppChannel.GET_ASSET, { assetPath });
  });

  ipcMain.on(AppChannel.RESIZE, (event, resizeData: ResizeData) => {
    resize(resizeData);
  });

  ipcMain.on(
    AppChannel.END_PROCESS,
    async (event, { pid, script }: { pid: number; script: Script }) => {
      // console.log('␛ ESCAPE_PRESSED', { pid, script });
      processes.removeByPid(pid);
      emitter.emit(KitEvent.ResumeShortcuts);

      endPrompt(script.filePath);
    }
  );

  ipcMain.on(
    AppChannel.OPEN_SCRIPT_LOG,
    async (event, { script }: AppState) => {
      const logPath = getLogFromScriptPath((script as Script).filePath);
      await runPromptProcess(kitPath('cli/edit-file.js'), [logPath]);
    }
  );

  ipcMain.on(
    AppChannel.OPEN_SCRIPT_DB,
    async (event, { focused, script }: AppState) => {
      const filePath = (focused as any)?.filePath || script?.filePath;
      const dbPath = path.resolve(
        filePath,
        '..',
        '..',
        'db',
        `_${path.basename(filePath).replace(/js$/, 'json')}`
      );
      await runPromptProcess(kitPath('cli/edit-file.js'), [dbPath]);
    }
  );

  ipcMain.on(
    AppChannel.OPEN_SCRIPT,
    async (event, { script, description, input }: Required<AppState>) => {
      // When the editor is editing a script. Toggle back to running the script.
      const descriptionIsFile = await isFile(description);
      const descriptionIsInKenv = isInDir(kenvPath())(description);

      if (descriptionIsInKenv && descriptionIsFile) {
        try {
          await writeFile(description, input);
          await updateScripts();
          await runPromptProcess(description, []);
        } catch (error) {
          log.error(error);
        }
        return;
      }

      const isInKit = isInDir(kitPath())(script.filePath);

      if (script.filePath && isInKit) return;

      await runPromptProcess(kitPath('cli/edit-file.js'), [script.filePath]);
    }
  );

  ipcMain.on(
    AppChannel.EDIT_SCRIPT,
    async (event, { script }: Required<AppState>) => {
      if ((isInDir(kitPath()), script.filePath)) return;
      await runPromptProcess(kitPath('main/edit.js'), [script.filePath]);
    }
  );

  ipcMain.on(
    AppChannel.OPEN_FILE,
    async (event, { script, focused }: Required<AppState>) => {
      const filePath = (focused as any)?.filePath || script?.filePath;

      await runPromptProcess(kitPath('cli/edit-file.js'), [filePath]);
    }
  );

  ipcMain.on(AppChannel.RUN_MAIN_SCRIPT, async () => {
    runPromptProcess(mainScriptPath);
  });

  ipcMain.on(AppChannel.RUN_PROCESSES_SCRIPT, async () => {
    runPromptProcess(kitPath('cli', 'processes.js'));
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
    Channel.LEFT,
    Channel.RIGHT,
    Channel.TAB,
    Channel.ESCAPE,
    Channel.VALUE_SUBMITTED,
    Channel.TAB_CHANGED,
    Channel.BLUR,
    Channel.ABANDON,
    Channel.GET_EDITOR_HISTORY,
    Channel.SHORTCUT,
    Channel.ON_PASTE,
    Channel.ON_DROP,
  ]) {
    // log.info(`😅 Registering ${channel}`);
    ipcMain.on(
      channel,
      handleChannel(async ({ child }, message) => {
        if (channel === Channel.ABANDON) {
          log.info(`⚠️ ABANDON`, message.pid);
        }
        // log.info({ channel, message });
        if ([Channel.VALUE_SUBMITTED, Channel.TAB_CHANGED].includes(channel)) {
          emitter.emit(KitEvent.ResumeShortcuts);
        }

        if (channel === Channel.VALUE_SUBMITTED) {
          kitState.ignoreBlur = false;

          if (message?.state?.value === Channel.TERMINAL) {
            message.state.value = ``;
          }
        }

        if (channel === Channel.ON_DROP) {
          showInactive();
        }

        if (channel === Channel.ON_PASTE) {
          const image = clipboard.readImage();
          const size = image.getSize();

          if (size?.width && size?.height && isFocused()) {
            const timestamp = format(new Date(), 'yyyy-MM-dd-hh-mm-ss');
            const filePath = path.join(kitConfig.imagePath, `${timestamp}.png`);
            await ensureDir(path.dirname(filePath));
            await writeFile(filePath, image.toPNG());
            clipboard.clear();
            clipboard.writeText(filePath);
            message.state.paste = filePath;
            message.state.isPasteImage = true;

            log.info(`📎 ${filePath}`);

            child?.send(message);
          }
          return; // Only send once above
        }

        if (child) {
          if (child?.channel) child?.send(message);
        }

        if (channel === Channel.ESCAPE) {
          // log.info(message.state);
          if (message.state.submitted) {
            child.kill();
          }
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

        // TODO: Use Finder's image preview db
        if (existsSync(newPath)) {
          // const pickIcon = isImage(newPath)
          //   ? newPath.endsWith('.gif') || newPath.endsWith('.svg')
          //     ? getAssetPath('icons8-image-file-24.png')
          //     : newPath
          //   : getAssetPath('icons8-file-48.png');
          event.sender.startDrag({
            file: newPath,
            icon: getAssetPath('icons8-file-50.png'),
          });
        }
      } catch (error) {
        log.warn(error);
      }
    }
  );

  ipcMain.on(AppChannel.FEEDBACK, async (event, data: Survey) => {
    // runScript(kitPath('cli', 'feedback.js'), JSON.stringify(data));

    try {
      const feedbackResponse = await axios.post(
        `https://scriptkit.com/api/feedback`,
        data
      );
      log.info(feedbackResponse.data);

      if (data?.email && data?.subscribe) {
        const subResponse = await axios.post(
          `https://scriptkit.com/api/subscribe`,
          {
            email: data?.email,
          }
        );

        log.info(subResponse.data);
      }
    } catch (error) {
      log.error(`Error sending feedback: ${error}`);
    }
  });

  // emitter.on(KitEvent.Blur, async () => {
  //   const promptProcessInfo = await processes.findPromptProcess();

  //   if (promptProcessInfo && promptProcessInfo.scriptPath) {
  //     const { child, scriptPath } = promptProcessInfo;
  //     emitter.emit(KitEvent.ResumeShortcuts);

  //     if (child) {
  //       log.info(`🙈 Blur process: ${scriptPath} id: ${child.pid}`);
  //       child?.send({ channel: Channel.PROMPT_BLURRED });
  //     }
  //   }

  //   setPromptState({
  //     hidden: false,
  //   });

  //   sendToPrompt(Channel.PROMPT_BLURRED);
  // });
};
