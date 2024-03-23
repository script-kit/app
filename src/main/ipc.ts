/* eslint-disable no-nested-ternary */
/* eslint-disable import/prefer-default-export */
/* eslint-disable no-restricted-syntax */
import { ipcMain } from 'electron';
import log from 'electron-log';
import path from 'path';
import { debounce } from 'lodash-es';
import axios from 'axios';
import { AppState, Script } from '@johnlindquist/kit';
import { Channel, Mode, UI } from '@johnlindquist/kit/core/enum';
import {
  kitPath,
  getLogFromScriptPath,
  tmpDownloadsDir,
  getMainScriptPath,
  isInDir,
  kenvPath,
  isFile,
} from '@johnlindquist/kit/core/utils';
import { AppMessage } from '@johnlindquist/kit/types/kitapp';
import { existsSync, renameSync } from 'fs';
import { writeFile } from 'fs/promises';
import { DownloaderHelper } from 'node-downloader-helper';
import detect from 'detect-file-type';
import { emitter, KitEvent } from '../shared/events';
import {
  ProcessAndPrompt,
  cachePreview,
  ensureIdleProcess,
  processes,
} from './process';

import { KitPrompt } from './prompt';
import { prompts } from './prompts';
import { runPromptProcess } from './kit';
import { AppChannel, HideReason, Trigger } from '../shared/enums';
import { ResizeData, Survey } from '../shared/types';
import { getAssetPath } from '../shared/assets';
import { kitState } from '../shared/state';
import { noChoice } from '../shared/defaults';
import { debounceInvokeSearch, invokeFlagSearch, invokeSearch } from './search';

let prevTransformedInput = '';
const checkShortcodesAndKeywords = (
  prompt: KitPrompt,
  rawInput: string,
): boolean => {
  log.info(`${prompt.pid}: 🔍 Checking shortcodes and keywords...`);
  const sendToPrompt = prompt.sendToPrompt;
  let transformedInput = rawInput;

  if (prompt.kitSearch.inputRegex) {
    // eslint-disable-next-line no-param-reassign
    transformedInput =
      rawInput.match(new RegExp(prompt.kitSearch.inputRegex, 'gi'))?.[0] || '';
  }

  if (!prevTransformedInput && !rawInput) {
    prompt.kitSearch.keywordCleared = false;
    return true;
  }

  if (prompt.kitSearch.commandChars.length) {
    if (prevTransformedInput === '') {
      const char = rawInput?.[rawInput.length - 2];
      if (!prompt.kitSearch.commandChars.includes(char)) {
        prevTransformedInput = transformedInput;
        prompt.kitSearch.input = transformedInput;

        return false;
      }
    }
    for (const char of prompt.kitSearch.commandChars) {
      if (rawInput.endsWith(char)) {
        prevTransformedInput = transformedInput;
        prompt.kitSearch.input = transformedInput;
        return false;
      }
    }
  }

  prevTransformedInput = transformedInput;

  const lowerCaseInput = transformedInput.toLowerCase();
  const trigger = prompt.kitSearch.triggers.get(lowerCaseInput);
  log.info(`${prompt.pid}: 🚀 Trigger:`, {
    trigger,
    triggers: prompt.kitSearch.triggers.keys(),
  });
  if (trigger) {
    sendToPrompt(Channel.SET_SUBMIT_VALUE, trigger.value);
    log.info(`👢 Trigger: ${transformedInput} triggered`);
    return false;
  }

  for (const [postfix, choice] of prompt.kitSearch.postfixes.entries()) {
    if (lowerCaseInput.endsWith(postfix)) {
      choice.postfix = transformedInput.replace(postfix, '');
      sendToPrompt(Channel.SET_SUBMIT_VALUE, choice);
      log.info(`🥾 Postfix: ${transformedInput} triggered`, choice);
      return false;
    }
  }

  if (
    prompt.kitSearch.keyword &&
    !rawInput.startsWith(`${prompt.kitSearch.keyword} `)
  ) {
    const keyword = '';
    if (rawInput === prompt.kitSearch.keyword) {
      prompt.kitSearch.input = prompt.kitSearch.keyword;
    }
    prompt.kitSearch.keyword = keyword;
    prompt.kitSearch.inputRegex = undefined;
    log.info(`🔑 ${keyword} cleared`);
    prompt.kitSearch.keywordCleared = true;
    sendToPrompt(AppChannel.TRIGGER_KEYWORD, {
      keyword,
      choice: noChoice,
    });

    return false;
  }

  if (rawInput.includes(' ')) {
    if (rawInput.endsWith(' ')) {
      const shortcodeChoice = prompt.kitSearch.shortcodes.get(
        transformedInput.toLowerCase().trimEnd(),
      );
      if (shortcodeChoice) {
        sendToPrompt(Channel.SET_SUBMIT_VALUE, shortcodeChoice.value);
        log.info(`🔑 Shortcode: ${transformedInput} triggered`);
        return false;
      }
    }

    const keyword = rawInput.split(' ')?.[0].trim();
    log.silly({ keyword, kitSearchKeyword: prompt.kitSearch.keyword });
    if (keyword !== prompt.kitSearch.keyword) {
      const keywordChoice = prompt.kitSearch.keywords.get(keyword);
      if (keywordChoice) {
        prompt.kitSearch.keyword = keyword;
        prompt.kitSearch.inputRegex = new RegExp(`^${keyword} `, 'gi');
        log.info(`🔑 ${keyword} triggered`);
        sendToPrompt(AppChannel.TRIGGER_KEYWORD, {
          keyword,
          choice: keywordChoice,
        });
        return false;
      }
    }
  }

  if (prompt.kitSearch.keywordCleared) {
    prompt.kitSearch.keywordCleared = false;
    return false;
  }

  return true;
};

const handleChannel =
  (fn: (processInfo: ProcessAndPrompt, message: AppMessage) => void) =>
  (_event: any, message: AppMessage) => {
    // TODO: Remove logging
    // log.info({
    //   message,
    // });
    log.silly(`📤 ${message.channel} ${message?.pid}`);
    if (message?.pid === 0) return;
    const processInfo = processes.getByPid(message?.pid);

    if (processInfo) {
      try {
        fn(processInfo, message);
      } catch (error) {
        log.error(`${message.channel} errored on ${message?.pid}`, message);
      }

      // log.info(`${message.channel}`, message.pid);
    } else if (message.pid !== -1 && !kitState.preloaded) {
      log.warn(`${message.channel} failed on ${message?.pid}`);

      processes.removeByPid(message?.pid);
      // TODO: Reimplement failed message with specific prompt
      // maybeHide(HideReason.MessageFailed);
      ensureIdleProcess();
    }
  };

export const startIpc = () => {
  ipcMain.on(
    AppChannel.ERROR_RELOAD,
    debounce(
      async (event, data: any) => {
        log.info(`AppChannel.ERROR_RELOAD`);
        const { scriptPath, pid } = data;
        const prompt = prompts.get(pid);
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

        // TODO: Reimplement
        if (prompt) {
          prompt.reload();
        } else {
          log.warn(`No prompt found for pid: ${pid}`);
        }
      },
      5000,
      { leading: true },
    ),
  );

  ipcMain.on(
    Channel.PROMPT_ERROR,
    debounce(
      (_event, { error }) => {
        log.info(`AppChannel.PROMPT_ERROR`);
        log.warn(error);
        if (!kitState.hiddenByUser) {
          setTimeout(() => {
            // TODO: Reimplement
            // reload();
            // processes.add(ProcessType.App, kitPath('cli/kit-log.js'), []);
            // escapePromptWindow();
          }, 4000);
        }
      },
      10000,
      { leading: true },
    ),
  );

  ipcMain.on(AppChannel.GET_ASSET, (event, { parts }) => {
    // log.info(`📁 GET_ASSET ${parts.join('/')}`);
    const assetPath = getAssetPath(...parts);
    log.info(`📁 Asset path: ${assetPath}`);
    event.sender.send(AppChannel.GET_ASSET, { assetPath });
  });

  ipcMain.on(AppChannel.RESIZE, (event, resizeData: ResizeData) => {
    const prompt = prompts.get(resizeData.pid);
    if (prompt) {
      prompt.resize(resizeData);
    }
  });

  ipcMain.on(AppChannel.RELOAD, async () => {
    log.info(`AppChannel.RELOAD`);
    // TODO: Reimplement
    // reload();

    await new Promise((resolve) => setTimeout(resolve, 1000));
    await runPromptProcess(getMainScriptPath(), [], {
      force: true,
      trigger: Trigger.Menu,
      sponsorCheck: false,
    });
  });

  ipcMain.on(AppChannel.OPEN_SCRIPT_LOG, async (event, script: Script) => {
    const logPath = getLogFromScriptPath((script as Script).filePath);
    await runPromptProcess(kitPath('cli/edit-file.js'), [logPath], {
      force: true,
      trigger: Trigger.Kit,
      sponsorCheck: false,
    });
  });

  ipcMain.on(AppChannel.END_PROCESS, (event, { pid }) => {
    const processInfo = processes.getByPid(pid);
    if (processInfo) {
      processes.removeByPid(pid);
    }
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
        `_${path.basename(filePath).replace(/js$/, 'json')}`,
      );
      await runPromptProcess(kitPath('cli/edit-file.js'), [dbPath], {
        force: true,
        trigger: Trigger.Kit,
        sponsorCheck: false,
      });
    },
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
            sponsorCheck: false,
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
        sponsorCheck: false,
      });
    },
  );

  ipcMain.on(
    AppChannel.EDIT_SCRIPT,
    async (event, { script }: Required<AppState>) => {
      if ((isInDir(kitPath()), script.filePath)) return;
      await runPromptProcess(kitPath('main/edit.js'), [script.filePath], {
        force: true,
        trigger: Trigger.Kit,
        sponsorCheck: false,
      });
    },
  );

  ipcMain.on(
    AppChannel.OPEN_FILE,
    async (event, { script, focused }: Required<AppState>) => {
      const filePath = (focused as any)?.filePath || script?.filePath;

      await runPromptProcess(kitPath('cli/edit-file.js'), [filePath], {
        force: true,
        trigger: Trigger.Kit,
        sponsorCheck: false,
      });
    },
  );

  ipcMain.on(AppChannel.RUN_MAIN_SCRIPT, async () => {
    runPromptProcess(getMainScriptPath(), [], {
      force: true,
      trigger: Trigger.Kit,
      sponsorCheck: false,
    });
  });

  ipcMain.on(AppChannel.RUN_PROCESSES_SCRIPT, async () => {
    runPromptProcess(kitPath('cli', 'processes.js'), [], {
      force: true,
      trigger: Trigger.Kit,
      sponsorCheck: false,
    });
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
    Channel.ON_MENU_TOGGLE,
    Channel.PLAY_AUDIO,
    Channel.GET_COLOR,
    Channel.CHAT_MESSAGES_CHANGE,
    Channel.ON_INIT,
    Channel.ON_SUBMIT,
    Channel.GET_DEVICES,
    Channel.APPEND_EDITOR_VALUE,
    Channel.GET_INPUT,
    Channel.EDITOR_GET_SELECTION,
    Channel.EDITOR_SET_CODE_HINT,
    Channel.EDITOR_GET_CURSOR_OFFSET,
    Channel.EDITOR_INSERT_TEXT,
    Channel.EDITOR_MOVE_CURSOR,
    Channel.KEYWORD_TRIGGERED,
    Channel.SELECTED,
    Channel.ACTION,
    Channel.MIC_STREAM,
    Channel.STOP_MIC,
  ]) {
    // log.info(`😅 Registering ${channel}`);
    ipcMain.on(
      channel,
      handleChannel(async ({ child, prompt, promptId }, message) => {
        const sendToPrompt = prompt.sendToPrompt;

        prompt.kitSearch.flaggedValue = message.state?.flaggedValue;

        message.promptId = promptId || '';

        log.verbose(`⬅ ${channel} ${prompt.ui} ${prompt.scriptPath}`);

        if (channel === Channel.MIC_STREAM) {
          const micStreamMessage: any = message;
          if (
            micStreamMessage?.state.buffer &&
            !Buffer.isBuffer(micStreamMessage.buffer)
          ) {
            micStreamMessage.state.value = Buffer.from(
              Object.values(micStreamMessage.state.buffer) as any,
            );
          }

          child.send(micStreamMessage);

          return;
        }

        if (channel === Channel.INPUT) {
          const input = message.state.input as string;
          // log.info(`📝 Input: ${input}`);
          if (!input) {
            log.info(`📝 No prompt input`);
            prompt.kitSearch.input = '';
            // keyword and regex will be cleared by checkShortcodesAndKeywords
            // prompt.kitSearch.inputRegex = undefined;
            // prompt.kitSearch.keyword = '';
          }

          const isArg = message.state.ui === UI.arg;
          const hasFlag = message.state.flaggedValue;

          if (isArg) {
            const shouldSearch = checkShortcodesAndKeywords(prompt, input);
            const isFilter = message.state.mode === Mode.FILTER;
            if (shouldSearch && isFilter) {
              if (hasFlag) {
                invokeFlagSearch(prompt, input);
              } else {
                debounceInvokeSearch.cancel();

                if (prompt.kitSearch.choices.length > 5000) {
                  debounceInvokeSearch(prompt, input, 'debounce');
                } else {
                  invokeSearch(prompt, input, `${channel}`);
                }
              }
            }
          }

          if (hasFlag) {
            message.channel = Channel.FLAG_INPUT;
            if (child?.channel && child.connected) child?.send(message);
            return;
          }
        }

        if (channel === Channel.ON_MENU_TOGGLE && prompt.flagSearch.input) {
          invokeFlagSearch(prompt, '');
        }

        if (channel === Channel.ESCAPE) {
          log.info(`␛ hideOnEscape ${prompt.hideOnEscape ? 'true' : 'false'}`);
          if (prompt.hideOnEscape) {
            prompt.maybeHide(HideReason.Escape);
            sendToPrompt(Channel.SET_INPUT, '');
          }
        }

        if (channel === Channel.ABANDON) {
          log.info(`⚠️ ABANDON`, message.pid);
        }
        // log.info({ channel, message });
        if ([Channel.VALUE_SUBMITTED, Channel.TAB_CHANGED].includes(channel)) {
          emitter.emit(KitEvent.ResumeShortcuts);
          kitState.tabIndex = message.state.tabIndex as number;
          kitState.tabChanged = true;
        }

        if (channel === Channel.VALUE_SUBMITTED) {
          log.info(`${child?.pid} 📝 Submitting...

`);

          if (!prompt.ready) {
            log.info(`${prompt.pid}: Prompt not ready..`, message);
          }
          prompt.clearSearch();

          if (message?.state?.value === Channel.TERMINAL) {
            message.state.value = ``;
          }

          if (prompt.scriptPath === getMainScriptPath()) {
            cachePreview(getMainScriptPath(), message?.state?.preview || '');

            if (
              typeof message?.state?.value?.filePath === 'string' &&
              !message?.state?.flag
            ) {
              prompt.attemptPreload(message?.state?.value?.filePath);
            }
          }
        }

        if (
          channel === Channel.ESCAPE ||
          (channel === Channel.SHORTCUT && message.state.shortcut === 'escape')
        ) {
          kitState.shortcutsPaused = false;
          log.verbose({
            submitted: message.state.submitted,
            pid: child.pid,
          });
          if (message.state.submitted) {
            child.kill();
            return;
          }
        }

        if (child) {
          try {
            if (child?.channel && child.connected) child?.send(message);
          } catch (e) {
            // ignore logging EPIPE errors
            log.error(`📤 ${channel} ERROR`, message);
            log.error(e);
          }
        }
      }),
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
                },
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
    },
  );

  ipcMain.on(AppChannel.FEEDBACK, async (event, data: Survey) => {
    // runScript(kitPath('cli', 'feedback.js'), JSON.stringify(data));

    try {
      const feedbackResponse = await axios.post(
        `${kitState.url}/api/feedback`,
        data,
      );
      log.info(feedbackResponse.data);

      if (data?.email && data?.subscribe) {
        const subResponse = await axios.post(`${kitState.url}/api/subscribe`, {
          email: data?.email,
        });

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
    },
  );

  ipcMain.on(AppChannel.LOGIN, async () => {
    runPromptProcess(kitPath('pro', 'login.js'), [], {
      force: true,
      trigger: Trigger.App,
      sponsorCheck: false,
    });
  });

  ipcMain.on(AppChannel.APPLY_UPDATE, async (event, data: any) => {
    log.info(`🚀 Applying update`);
    kitState.applyUpdate = true;
  });
};
