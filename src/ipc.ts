/* eslint-disable no-nested-ternary */
/* eslint-disable import/prefer-default-export */
/* eslint-disable no-restricted-syntax */
import { ipcMain } from 'electron';
import log from 'electron-log';
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
import { DownloaderHelper } from 'node-downloader-helper';
import detect from 'detect-file-type';
import { emitter, KitEvent } from './events';
import { processes } from './process';

import { focusPrompt, reload, resize, setBackgroundThrottling } from './prompt';
import { runPromptProcess } from './kit';
import { AppChannel, Trigger } from './enums';
import { ResizeData, Survey } from './types';
import { getAssetPath } from './assets';
import { kitState } from './state';

const handleChannel = (
  fn: (processInfo: ProcessInfo, message: AppMessage) => void
) => (_event: any, message: AppMessage) => {
  // TODO: Remove logging
  log.info({
    message,
  });
  if (message?.pid === 0) return;
  const processInfo = processes.getByPid(message?.pid);

  if (processInfo) {
    try {
      fn(processInfo, message);
    } catch (error) {
      log.error(`${message.channel} errored on ${message?.pid}`, message);
    }

    // log.info(`${message.channel}`, message.pid);
  } else if (message.pid !== -1) {
    log.warn(`${message.channel} failed on ${message?.pid}`);
  }
};

export const startIpc = () => {
  ipcMain.on(
    AppChannel.ERROR_RELOAD,
    debounce(
      async (event, data: any) => {
        log.info(`AppChannel.ERROR_RELOAD`);
        const { scriptPath } = kitState;
        const onReload = async () => {
          const markdown = `# Error

${data.message}

${data.error}
          `;
          emitter.emit(KitEvent.RunPromptProcess, {
            scriptPath: kitPath('cli', 'info.js'),
            args: [path.basename(scriptPath), `Error... `, markdown],
            options: {
              force: true,
              trigger: Trigger.Info,
            },
          });
        };

        reload(onReload);
      },
      5000,
      { leading: true }
    )
  );

  ipcMain.on(
    Channel.PROMPT_ERROR,
    debounce(
      (_event, { error }) => {
        log.info(`AppChannel.PROMPT_ERROR`);
        log.warn(error);
        if (!kitState.hiddenByUser) {
          setTimeout(() => {
            reload();
            // processes.add(ProcessType.App, kitPath('cli/kit-log.js'), []);
            // escapePromptWindow();
          }, 4000);
        }
      },
      10000,
      { leading: true }
    )
  );

  ipcMain.on(AppChannel.GET_ASSET, (event, { parts }) => {
    // log.info(`📁 GET_ASSET ${parts.join('/')}`);
    const assetPath = getAssetPath(...parts);
    log.info(`📁 Asset path: ${assetPath}`);
    event.sender.send(AppChannel.GET_ASSET, { assetPath });
  });

  ipcMain.on(AppChannel.RESIZE, (event, resizeData: ResizeData) => {
    resize(resizeData);
  });

  ipcMain.on(AppChannel.RELOAD, async () => {
    log.info(`AppChannel.RELOAD`);
    reload();

    await new Promise((resolve) => setTimeout(resolve, 1000));
    await runPromptProcess(mainScriptPath, [], {
      force: true,
      trigger: Trigger.Menu,
    });
  });

  ipcMain.on(AppChannel.OPEN_SCRIPT_LOG, async (event, script: Script) => {
    const logPath = getLogFromScriptPath((script as Script).filePath);
    await runPromptProcess(kitPath('cli/edit-file.js'), [logPath], {
      force: true,
      trigger: Trigger.Kit,
    });
  });

  ipcMain.on(AppChannel.END_PROCESS, (event, { pid }) => {
    log.info(`AppChannel.END_PROCESS ${pid}`);
    const processInfo = processes.getByPid(pid);
    if (processInfo) {
      processes.removeByPid(pid);
    }
  });

  ipcMain.on(AppChannel.ENABLE_BACKGROUND_THROTTLING, () => {
    setBackgroundThrottling(true);
  });

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
      await runPromptProcess(kitPath('cli/edit-file.js'), [dbPath], {
        force: true,
        trigger: Trigger.Kit,
      });
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
          await runPromptProcess(description, [], {
            force: true,
            trigger: Trigger.Kit,
          });
        } catch (error) {
          log.error(error);
        }
        return;
      }

      const isInKit = isInDir(kitPath())(script.filePath);

      if (script.filePath && isInKit) return;

      await runPromptProcess(kitPath('cli/edit-file.js'), [script.filePath], {
        force: true,
        trigger: Trigger.Kit,
      });
    }
  );

  ipcMain.on(
    AppChannel.EDIT_SCRIPT,
    async (event, { script }: Required<AppState>) => {
      if ((isInDir(kitPath()), script.filePath)) return;
      await runPromptProcess(kitPath('main/edit.js'), [script.filePath], {
        force: true,
        trigger: Trigger.Kit,
      });
    }
  );

  ipcMain.on(
    AppChannel.OPEN_FILE,
    async (event, { script, focused }: Required<AppState>) => {
      const filePath = (focused as any)?.filePath || script?.filePath;

      await runPromptProcess(kitPath('cli/edit-file.js'), [filePath], {
        force: true,
        trigger: Trigger.Kit,
      });
    }
  );

  ipcMain.on(AppChannel.RUN_MAIN_SCRIPT, async () => {
    runPromptProcess(mainScriptPath, [], {
      force: true,
      trigger: Trigger.Kit,
    });
  });

  ipcMain.on(AppChannel.RUN_PROCESSES_SCRIPT, async () => {
    runPromptProcess(kitPath('cli', 'processes.js'), [], {
      force: true,
      trigger: Trigger.Kit,
    });
  });

  ipcMain.on(AppChannel.FOCUS_PROMPT, () => {
    focusPrompt();
  });

  for (const channel of [
    Channel.INPUT,
    Channel.CHANGE,
    Channel.CHOICE_FOCUSED,
    Channel.MESSAGE_FOCUSED,
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
    Channel.ON_DRAG_ENTER,
    Channel.ON_DRAG_LEAVE,
    Channel.ON_DRAG_OVER,
    Channel.PLAY_AUDIO,
    Channel.GET_COLOR,
    Channel.CHAT_MESSAGES_CHANGE,
    Channel.ON_INIT,
    Channel.ON_SUBMIT,
    Channel.ON_AUDIO_DATA,
    Channel.GET_DEVICES,
  ]) {
    // log.info(`😅 Registering ${channel}`);
    ipcMain.on(
      channel,
      handleChannel(async ({ child }, message) => {
        log.verbose(`⬅ ${channel}`);

        if (channel === Channel.ABANDON) {
          log.info(`⚠️ ABANDON`, message.pid);
        }
        // log.info({ channel, message });
        if ([Channel.VALUE_SUBMITTED, Channel.TAB_CHANGED].includes(channel)) {
          emitter.emit(KitEvent.ResumeShortcuts);
        }

        if (channel === Channel.VALUE_SUBMITTED) {
          log.verbose(`📝 Submitting...`);
          kitState.ignoreBlur = false;

          if (message?.state?.value === Channel.TERMINAL) {
            message.state.value = ``;
          }
        }

        // if (channel === Channel.ON_PASTE) {
        //   const image = clipboard.readImage();
        //   const size = image.getSize();

        //   if (size?.width && size?.height && isFocused()) {
        //     const timestamp = format(new Date(), 'yyyy-MM-dd-hh-mm-ss');
        //     const filePath = path.join(kitConfig.imagePath, `${timestamp}.png`);
        //     await ensureDir(path.dirname(filePath));
        //     await writeFile(filePath, image.toPNG());
        //     clipboard.clear();
        //     clipboard.writeText(filePath);
        //     message.state.paste = filePath;
        //     message.state.isPasteImage = true;

        //     log.info(`📎 ${filePath}`);

        //     child?.send(message);
        //   }
        //   return; // Only send once above
        // }

        // log.info(`>>>>>>>>>>>>>>>>> CHANNEL`, channel, message.state.shortcut);

        if (channel === Channel.BLUR && kitState.debugging) return;

        if (
          channel === Channel.ESCAPE ||
          (channel === Channel.SHORTCUT && message.state.shortcut === 'escape')
        ) {
          kitState.shortcutsPaused = false;
          log.verbose({
            submitted: message.state.submitted,
            debugging: kitState.debugging,
            pid: child.pid,
          });
          if (message.state.submitted || kitState.debugging) {
            kitState.debugging = false;
            child.kill();
            return;
          }
        }

        // if (
        //   typeof message?.state?.value === 'string' &&
        //   message?.state?.value.startsWith('data:image/png;base64')
        // ) {
        //   // convert to image buffer
        //   try {
        //     const imgBuffer = nativeImage
        //       .createFromDataURL(message.state.value)
        //       .toPNG();
        //     message.state.value = imgBuffer
        //   } catch (error) {
        //     log.error(error);
        //   }
        // }

        if (child) {
          try {
            if (child?.channel && child.connected) child?.send(message);
          } catch (e) {
            // ignore logging EPIPE errors
            log.error(`📤 ${channel} ERROR`, message);
            log.error(e);
          }
        }
      })
    );
  }

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

  type levelType = 'debug' | 'info' | 'warn' | 'error' | 'silly';
  ipcMain.on(
    AppChannel.LOG,
    async (event, { message, level }: { message: any; level: levelType }) => {
      log[level](message);
    }
  );

  ipcMain.on(AppChannel.LOGIN, async () => {
    runPromptProcess(kitPath('pro', 'login.js'), [], {
      force: true,
      trigger: Trigger.App,
    });
  });

  ipcMain.on(AppChannel.APPLY_UPDATE, async (event, data: any) => {
    log.info(`🚀 Applying update`);
    kitState.applyUpdate = true;
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
