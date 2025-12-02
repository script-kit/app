import { existsSync, renameSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { AppState, Script, Scriptlet } from '@johnlindquist/kit';
import { Channel, Mode, UI } from '@johnlindquist/kit/core/enum';
import {
  getLogFromScriptPath,
  getMainScriptPath,
  isFile,
  isInDir,
  kenvPath,
  kitPath,
  tmpDownloadsDir,
} from '@johnlindquist/kit/core/utils';
import type { AppMessage } from '@johnlindquist/kit/types/kitapp';
import axios from 'axios';
import detect from 'detect-file-type';
/* eslint-disable no-nested-ternary */
/* eslint-disable import/prefer-default-export */
/* eslint-disable no-restricted-syntax */
import { ipcMain } from 'electron';
import { debounce } from 'lodash-es';
import { DownloaderHelper } from 'node-downloader-helper';
import { getAssetPath } from '../shared/assets';
import { noChoice } from '../shared/defaults';
import { AppChannel, HideReason, Trigger } from '../shared/enums';
import { emitter, KitEvent } from '../shared/events';
import type { ResizeData, Survey } from '../shared/types';
import { clearAvatarCache, getCachedAvatar } from './avatar-cache';
import { recordSelection } from './frecency';
import { runPromptProcess } from './kit';
import { ipcLog as log } from './logs';
import { ensureIdleProcess, type ProcessAndPrompt, processes } from './process';
import type { KitPrompt } from './prompt';
import { prompts } from './prompts';
import { debounceInvokeSearch, invokeFlagSearch, invokeSearch } from './search';
import { registerScreenRecordingHandlers } from './screen-recording';
import { kitState } from './state';
import { visibilityController } from './visibility';

let actionsOpenTimeout: NodeJS.Timeout;
let prevTransformedInput = '';

const checkShortcodesAndKeywords = (prompt: KitPrompt, rawInput: string): boolean => {
  //   log.info(`

  //   🔍🔍🔍
  // ${prompt.pid}: 🔍 Checking shortcodes and keywords... '${rawInput}'
  //   🔍🔍🔍

  //   `);
  const sendToPrompt = prompt.sendToPrompt;
  let transformedInput = rawInput;

  if (prompt.kitSearch.inputRegex) {
    // eslint-disable-next-line no-param-reassign
    transformedInput = rawInput.match(new RegExp(prompt.kitSearch.inputRegex, 'gi'))?.[0] || '';
  }

  if (!(prevTransformedInput || rawInput)) {
    prompt.kitSearch.keywordCleared = false;
    return true;
  }

  if (prompt.kitSearch.commandChars.length > 0) {
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
  // log.verbose(`${prompt.pid}: 🚀 Trigger:`, {
  //   trigger,
  //   triggers: prompt.kitSearch.triggers.keys(),
  // });
  if (trigger) {
    if (prompt.ready) {
      log.info(`${prompt.getLogPrefix()}: 👢 Trigger: ${transformedInput} triggered`, trigger);

      if (trigger?.value?.inputs?.length > 0) {
        log.info(
          `${prompt.getLogPrefix()}: 📝 Trigger: ${transformedInput} blocked. Inputs required`,
          trigger.value.inputs,
        );
        sendToPrompt(Channel.SET_INVALIDATE_CHOICE_INPUTS, true);
      } else {
        sendToPrompt(Channel.SET_SUBMIT_VALUE, trigger?.value ? trigger.value : trigger);
        return false;
      }
    } else {
      log.info(`${prompt.getLogPrefix()}: 😩 Not ready`, JSON.stringify(trigger));
    }
  }

  for (const [postfix, choice] of prompt.kitSearch.postfixes.entries()) {
    if (choice && lowerCaseInput.endsWith(postfix)) {
      log.info(`${prompt.getLogPrefix()}: 🥾 Postfix: ${transformedInput} triggered`, choice);
      if ((choice as Scriptlet)?.inputs?.length > 0) {
        log.info(
          `${prompt.getLogPrefix()}: 📝 Postfix: ${transformedInput} blocked. Inputs required`,
          (choice as Scriptlet).inputs,
        );
        sendToPrompt(Channel.SET_INVALIDATE_CHOICE_INPUTS, true);
      } else {
        (choice as Script).postfix = transformedInput.replace(postfix, '');
        sendToPrompt(Channel.SET_SUBMIT_VALUE, choice);
        return false;
      }
    }
  }

  if (prompt.kitSearch.keyword && !rawInput.startsWith(`${prompt.kitSearch.keyword} `)) {
    const keyword = '';
    if (rawInput === prompt.kitSearch.keyword) {
      prompt.kitSearch.input = prompt.kitSearch.keyword;
    }
    prompt.kitSearch.keyword = keyword;
    prompt.kitSearch.inputRegex = undefined;
    log.info(`${prompt.getLogPrefix()}: 🔑 ${keyword} cleared`);
    prompt.kitSearch.keywordCleared = true;
    sendToPrompt(AppChannel.TRIGGER_KEYWORD, {
      keyword,
      choice: noChoice,
    });

    return false;
  }

  if (rawInput.includes(' ')) {
    if (rawInput.endsWith(' ')) {
      const shortcodeChoice = prompt.kitSearch.shortcodes.get(transformedInput.toLowerCase().trimEnd());
      if (shortcodeChoice) {
        sendToPrompt(Channel.SET_SUBMIT_VALUE, shortcodeChoice.value);
        log.info(`${prompt.getLogPrefix()}: 🔑 Shortcode: ${transformedInput} triggered`);
        return false;
      }
    }

    const keyword = rawInput.split(' ')?.[0].trim();
    if (keyword !== prompt.kitSearch.keyword) {
      const keywordChoice = prompt.kitSearch.keywords.get(keyword);
      if (keywordChoice) {
        prompt.kitSearch.keyword = keyword;
        prompt.kitSearch.inputRegex = new RegExp(`^${keyword} `, 'gi');
        log.info(`${prompt.getLogPrefix()}: 🔑 ${keyword} triggered`);
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

const handleMessageFail = debounce(
  (message: AppMessage) => {
    log.warn(`${message?.pid}: pid closed. Attempted ${message.channel}, but ignored.`);

    processes.removeByPid(message?.pid, 'ipc handleMessageFail');
    // TODO: Reimplement failed message with specific prompt
    // maybeHide(HideReason.MessageFailed);
    ensureIdleProcess();
  },
  100,
  { leading: true },
);

const handleChannel =
  (fn: (processInfo: ProcessAndPrompt, message: AppMessage) => void) => (_event: any, message: AppMessage) => {
    // TODO: Remove logging
    // log.info({
    //   message,
    // });
    log.silly(`📤 ${message.channel} ${message?.pid}`);
    if (message?.pid === 0) {
      return;
    }
    const processInfo = processes.getByPid(message?.pid);

    if (processInfo) {
      try {
        fn(processInfo, message);
      } catch (error) {
        log.error(`${message.channel} errored on ${message?.pid}`, message);
      }

      // log.info(`${message.channel}`, message.pid);
      // TODO: Handler preloaded?
    } else if (message.pid !== -1) {
      handleMessageFail(message);
    }
  };

export const startIpc = () => {
  ipcMain.on(
    AppChannel.ERROR_RELOAD,
    debounce(
      (_event, data: any) => {
        log.info('AppChannel.ERROR_RELOAD');
        const { scriptPath, pid } = data;
        const prompt = prompts.get(pid);
        const onReload = () => {
          const markdown = `# Error

${data.message}

${data.error}
          `;
          emitter.emit(KitEvent.RunPromptProcess, {
            scriptPath: kitPath('cli', 'info.js'),
            args: [path.basename(scriptPath), 'Error... ', markdown],
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
        log.info('AppChannel.PROMPT_ERROR');
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

  // Avatar cache handlers
  ipcMain.handle(AppChannel.GET_CACHED_AVATAR, async (_event, avatarUrl: string) => {
    return getCachedAvatar(avatarUrl);
  });

  ipcMain.handle(AppChannel.CLEAR_AVATAR_CACHE, async () => {
    return clearAvatarCache();
  });

  ipcMain.on(AppChannel.RESIZE, (_event, resizeData: ResizeData) => {
    const prompt = prompts.get(resizeData.pid);
    // log.info(`>>>>>>>>>>>>> AppChannel.RESIZE`, {
    //   prompt,
    //   pid: resizeData.pid,
    //   pids: prompts.pids(),
    // });
    if (prompt) {
      prompt.resize(resizeData);
    }
  });

  ipcMain.on(AppChannel.RELOAD, async () => {
    log.info('AppChannel.RELOAD');
    // TODO: Reimplement
    // reload();

    await new Promise((resolve) => setTimeout(resolve, 1000));
    await runPromptProcess(getMainScriptPath(), [], {
      force: true,
      trigger: Trigger.Menu,
      sponsorCheck: false,
    });
  });

  ipcMain.on(AppChannel.OPEN_SCRIPT_LOG, async (_event, script: Script) => {
    const logPath = getLogFromScriptPath((script as Script).filePath);
    await runPromptProcess(kitPath('cli/edit-file.js'), [logPath], {
      force: true,
      trigger: Trigger.Kit,
      sponsorCheck: false,
    });
  });

  ipcMain.on(AppChannel.END_PROCESS, (_event, { pid }) => {
    const processInfo = processes.getByPid(pid);
    log.info('AppChannel.END_PROCESS', {
      pid,
      processInfoType: typeof processInfo,
    });
    if (processInfo) {
      processes.removeByPid(pid, 'ipc endProcess');
    }
  });

  ipcMain.on(AppChannel.OPEN_SCRIPT_DB, async (_event, { focused, script }: AppState) => {
    const filePath = (focused as any)?.filePath || script?.filePath;
    const dbPath = path.resolve(filePath, '..', '..', 'db', `_${path.basename(filePath).replace(/js$/, 'json')}`);
    await runPromptProcess(kitPath('cli/edit-file.js'), [dbPath], {
      force: true,
      trigger: Trigger.Kit,
      sponsorCheck: false,
    });
  });

  ipcMain.on(AppChannel.OPEN_SCRIPT, async (_event, { script, description, input }: Required<AppState>) => {
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

    if (script.filePath && isInKit) {
      return;
    }

    await runPromptProcess(kitPath('cli/edit-file.js'), [script.filePath], {
      force: true,
      trigger: Trigger.Kit,
      sponsorCheck: false,
    });
  });

  ipcMain.on(AppChannel.EDIT_SCRIPT, async (_event, { script }: Required<AppState>) => {
    if (isInDir(kitPath())(script.filePath)) {
      return;
    }
    await runPromptProcess(kitPath('main/edit.js'), [script.filePath], {
      force: true,
      trigger: Trigger.Kit,
      sponsorCheck: false,
    });
  });

  ipcMain.on(AppChannel.OPEN_FILE, async (_event, { script, focused }: Required<AppState>) => {
    const filePath = (focused as any)?.filePath || script?.filePath;

    await runPromptProcess(kitPath('cli/edit-file.js'), [filePath], {
      force: true,
      trigger: Trigger.Kit,
      sponsorCheck: false,
    });
  });

  ipcMain.on(AppChannel.RUN_MAIN_SCRIPT, () => {
    runPromptProcess(getMainScriptPath(), [], {
      force: true,
      trigger: Trigger.Kit,
      sponsorCheck: false,
    });
  });

  ipcMain.on(AppChannel.RUN_KENV_TRUST_SCRIPT, (_event, { kenv }) => {
    log.info(`🔑 Running kenv-trust script for ${kenv}`);
    prompts.focused?.close('run kenv-trust script');
    runPromptProcess(kitPath('cli', 'kenv-trust.js'), [kenv], {
      force: true,
      trigger: Trigger.Kit,
      sponsorCheck: false,
    });
  });

  ipcMain.on(AppChannel.RUN_PROCESSES_SCRIPT, () => {
    runPromptProcess(kitPath('cli', 'processes.js'), [], {
      force: true,
      trigger: Trigger.Kit,
      sponsorCheck: false,
    });
  });

  for (const channel of [
    Channel.ACTIONS_INPUT,
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
    Channel.CHAT_ADD_MESSAGE,
    Channel.CHAT_PUSH_TOKEN,
    Channel.CHAT_SET_MESSAGE,
  ]) {
    // log.info(`😅 Registering ${channel}`);
    ipcMain.on(
      channel,
      handleChannel(async ({ child, prompt, promptId }, message) => {
        // log.info(`${prompt.pid}: IPC: 📤 ${channel}`, message.state);
        const sendToPrompt = prompt.sendToPrompt;

        prompt.kitSearch.flaggedValue = message.state?.flaggedValue;

        message.promptId = promptId || '';

        log.verbose(`⬅ ${channel} ${prompt.ui} ${prompt.scriptPath}`);

        if (channel === Channel.MIC_STREAM) {
          const micStreamMessage: any = message;
          if (micStreamMessage?.state?.buffer && !Buffer.isBuffer(micStreamMessage.state.buffer)) {
            const b = micStreamMessage.state.buffer;
            // Accept ArrayBuffer, Uint8Array, or a plain {0:..,1:..} object
            let u8: Uint8Array;
            if (b instanceof ArrayBuffer) u8 = new Uint8Array(b);
            else if (ArrayBuffer.isView(b)) u8 = new Uint8Array(b.buffer, b.byteOffset, b.byteLength);
            else u8 = Uint8Array.from(Object.values(b as any));
            micStreamMessage.state.value = Buffer.from(u8);
            // Optional: drop the original to keep messages small
            delete micStreamMessage.state.buffer;
          }

          child.send(micStreamMessage);

          return;
        }

        if (channel === Channel.INPUT) {
          const input = message.state.input as string;
          // log.info(`📝 Input: ${input}`);
          if (!input) {
            log.info(`${prompt.pid}: 📝 No prompt input`);
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
              debounceInvokeSearch.cancel();

              if (prompt.kitSearch.choices.length > 5000) {
                debounceInvokeSearch(prompt, input, 'debounce');
              } else {
                invokeSearch(prompt, input, `${channel}`);
              }
            }
          }
        }

        if (channel === Channel.ACTION) {
          log.info(`[Main] ACTION received:`, {
            pid: message.pid,
            hasAction: message.state?.action !== undefined,
            actionName: message.state?.action?.name,
            actionFlag: message.state?.action?.flag,
            actionValue: message.state?.action?.value,
          });
          // Don't return here - let it pass through to child process
        }

        if (channel === Channel.ACTIONS_INPUT) {
          const actionsInput = message.state.actionsInput as string;
          invokeFlagSearch(prompt, actionsInput);
          return;
        }

        if (channel === Channel.ON_MENU_TOGGLE) {
          const hasFlaggedValue = Boolean(message.state.flaggedValue);
          log.info(`🔍 Actions menu ${hasFlaggedValue ? 'open' : 'closed'}`);
          prompt.actionsOpen = hasFlaggedValue;

          if (hasFlaggedValue) {
            prompt.wasActionsJustOpen = true;
          } else {
            clearTimeout(actionsOpenTimeout);
            actionsOpenTimeout = setTimeout(() => {
              prompt.wasActionsJustOpen = false;
            }, 50);
          }
        }

        if (channel === Channel.ON_MENU_TOGGLE && prompt.flagSearch.input) {
          invokeFlagSearch(prompt, '');
        }

        if (channel === Channel.ESCAPE) {
          log.info(`␛ Escape received in IPC handler`);

          const hasChild = !!child && child.connected;
          const handled = visibilityController.handleEscape(prompt, hasChild);

          // If visibility controller didn't handle it, let it propagate to child process
          if (!handled) {
            log.info(`␛ Escape not handled by visibility controller, propagating to child process`);

            // Check if we can actually send to child
            if (!child || !child.connected) {
              log.warn(`␛ Child process not ready to receive escape, closing prompt`);

              // Kill any existing child process
              if (child?.pid) {
                child.kill();
              }

              // Hide the prompt
              prompt.maybeHide(HideReason.Escape);
              prompt.sendToPrompt(Channel.SET_INPUT, '');

              // Clean up the process
              processes.removeByPid(prompt.pid, 'escape with no child');

              return; // Don't try to send to child
            }
          }
        }

        if (channel === Channel.ABANDON) {
          log.info('⚠️ ABANDON', message.pid);
        }
        // log.info({ channel, message });
        if ([Channel.VALUE_SUBMITTED, Channel.TAB_CHANGED].includes(channel)) {
          emitter.emit(KitEvent.ResumeShortcuts);
          kitState.tabIndex = message.state.tabIndex as number;
        }

        if (channel === Channel.VALUE_SUBMITTED) {
          prompt.mainMenuPreventCloseOnBlur = true;
          log.info(
            `
-------------
${child?.pid} 📝 Submitting...
-------------`.trim(),
          );

          // Record frecency for the selected choice
          const focusedChoiceId = message?.state?.focused?.id;
          if (focusedChoiceId && typeof focusedChoiceId === 'string') {
            recordSelection(focusedChoiceId).catch((err) => {
              log.warn(`Failed to record frecency: ${err}`);
            });
          }

          // TODO: Is this still necessary? It was breaking a scenario around empty strings in an arg.
          // It would also need to check if there are "info" choices.
          // if (!message?.state?.value && message?.state?.script && prompt.kitSearch?.choices?.length > 0) {
          //   message.state.value = message.state.focused;
          // }

          if (!prompt.ready) {
            log.info(`${prompt.pid}: Prompt not ready..`, message);
          }
          prompt.clearSearch();

          if (message?.state?.value === Channel.TERMINAL) {
            message.state.value = '';
          }
        }

        if (channel === Channel.SHORTCUT) {
          prompt.mainMenuPreventCloseOnBlur = true;
        }

        if (channel === Channel.ESCAPE || (channel === Channel.SHORTCUT && message.state.shortcut === 'escape')) {
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
            // if (channel === Channel.VALUE_SUBMITTED) {
            //   log.info(`${prompt.pid}: child.send: ${channel}`, message, {
            //     scriptPath: prompt.scriptPath,
            //     scriptSet: prompt.scriptSet,
            //   });
            // }
            if (child?.channel && child.connected) {
              // Back-compat for chat channels: child expects top-level `value`
              if (
                [Channel.CHAT_ADD_MESSAGE, Channel.CHAT_PUSH_TOKEN, Channel.CHAT_SET_MESSAGE].includes(channel as any)
              ) {
                try {
                  const msg: any = message as any;
                  const hadTopValue = msg.value !== undefined;
                  const stateValue = msg?.state?.value;
                  if (!hadTopValue && stateValue !== undefined) {
                    msg.value = stateValue;
                  }
                  log.info(`[Main IPC] forwarding ${channel}`, {
                    pid: message.pid,
                    promptId: message.promptId,
                    hadTopValue,
                    hasStateValue: stateValue !== undefined,
                    valueType: typeof msg.value,
                    textLen: typeof msg.value?.text === 'string' ? msg.value.text.length : undefined,
                  });
                } catch (e) {
                  log.warn(`[Main IPC] chat forward log error for ${channel}`, e);
                }
              }

              child?.send(message);
            } else {
              log.warn(`${prompt.pid}: Child not connected: ${channel}`, message);
            }
          } catch (e) {
            // ignore logging EPIPE errors
            log.error(`📤 ${channel} ERROR`, message);
            log.error(e);
          }
        }
      }),
    );
  }

  ipcMain.on(AppChannel.DRAG_FILE_PATH, async (event, { filePath, icon }: { filePath: string; icon: string }) => {
    try {
      let newPath = filePath;
      if (filePath.startsWith('http')) {
        newPath = await new Promise((resolve, _reject) => {
          const dl = new DownloaderHelper(filePath, tmpDownloadsDir, {
            override: true,
          });
          dl.on('end', (downloadInfo) => {
            const fp = downloadInfo.filePath;
            detect.fromFile(fp, (err: any, result: { ext: string; mime: string }) => {
              if (err) {
                throw err;
              }
              if (fp.endsWith(result.ext)) {
                resolve(fp);
              } else {
                const fixedFilePath = `${fp}.${result.ext}`;
                renameSync(fp, fixedFilePath);
                resolve(fixedFilePath);
              }
            });
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
  });

  ipcMain.on(AppChannel.FEEDBACK, async (_event, data: Survey) => {
    // runScript(kitPath('cli', 'feedback.js'), JSON.stringify(data));

    try {
      const feedbackResponse = await axios.post(`${kitState.url}/api/feedback`, data);
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
  ipcMain.on(AppChannel.LOG, (_event, { message, level }: { message: any; level: levelType }) => {
    log[level](message);
  });

  ipcMain.on(AppChannel.LOGIN, () => {
    runPromptProcess(kitPath('pro', 'login.js'), [], {
      force: true,
      trigger: Trigger.App,
      sponsorCheck: false,
    });
  });

  // Register screen recording handlers
  registerScreenRecordingHandlers();
};
