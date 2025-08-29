import DOMPurify from 'dompurify';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import { debounce } from 'lodash-es';
import { useEffect, useState } from 'react';
import { flushSync } from 'react-dom';
import { toast } from 'react-toastify';
const { ipcRenderer } = window.electron;
import { Channel } from '@johnlindquist/kit/core/enum';
import type { Choice } from '@johnlindquist/kit/types';
import type { ChannelMap, KeyData } from '@johnlindquist/kit/types/kitapp';
import {
  actionsConfigAtom,
  addChatMessageAtom,
  appConfigAtom,
  appendInputAtom,
  appendToLogHTMLAtom,
  audioAtom,
  audioDotAtom,
  beforeInputAtom,
  blurAtom,
  boundsAtom,
  cachedMainFlagsAtom,
  cachedMainPreviewAtom,
  cachedMainScoredChoicesAtom,
  cachedMainShortcutsAtom,
  channelAtom,
  chatMessagesAtom,
  chatPushTokenAtom,
  choicesConfigAtom,
  clearCacheAtom,
  colorAtom,
  cssAtom,
  descriptionAtom,
  devToolsOpenAtom,
  editorAppendAtom,
  editorConfigAtom,
  editorLogModeAtom,
  editorSuggestionsAtom,
  enterAtom,
  exitAtom,
  flaggedChoiceValueAtom,
  flagsAtom,
  footerAtom,
  getEditorHistoryAtom,
  hintAtom,
  initPromptAtom,
  inputAtom,
  invalidateChoiceInputsAtom,
  isHiddenAtom,
  isReadyAtom,
  isWindowAtom,
  kitConfigAtom,
  kitStateAtom,
  lastLogLineAtom,
  loadingAtom,
  logValueAtom,
  logoAtom,
  micConfigAtom,
  micIdAtom,
  micStreamEnabledAtom,
  nameAtom,
  openAtom,
  panelHTMLAtom,
  pidAtom,
  placeholderAtom,
  preloadedAtom,
  preventSubmitAtom,
  previewHTMLAtom,
  progressAtom,
  promptBoundsAtom,
  promptDataAtom,
  resizingAtom,
  runningAtom,
  scoredChoicesAtom,
  scoredFlagsAtom,
  scriptAtom,
  scrollToIndexAtom,
  selectedChoicesAtom,
  setChatMessageAtom,
  setFocusedChoiceAtom,
  shortcodesAtom,
  shortcutsAtom,
  speechAtom,
  splashBodyAtom,
  splashHeaderAtom,
  splashProgressAtom,
  submitValueAtom,
  tabIndexAtom,
  tabsAtom,
  tempThemeAtom,
  termConfigAtom,
  termExitAtom,
  termFontAtom,
  termOutputAtom,
  textareaConfigAtom,
  textareaValueAtom,
  themeAtom,
  toggleAllSelectedChoicesAtom,
  triggerKeywordAtom,
  triggerResizeAtom,
  valueInvalidAtom,
  webcamIdAtom,
  zoomAtom,
} from '../jotai';

import { createLogger } from '../log-utils';
const log = createLogger('useMessages.ts');

import { AppChannel, WindowChannel } from '../../../shared/enums';
import { resizeInflightAtom } from '../state/resize/scheduler';

export function ansiRegex({ onlyFirst = false } = {}) {
  const pattern = [
    '[\\u001B\\u009B][[\\]()#;?]*(?:(?:(?:[a-zA-Z\\d]*(?:;[-a-zA-Z\\d\\/#&.:=?%@~_]*)*)?\\u0007)',
    '(?:(?:\\d{1,4}(?:;\\d{0,4})*)?[\\dA-PR-TZcf-ntqry=><~]))',
  ].join('|');

  return new RegExp(pattern, onlyFirst ? undefined : 'g');
}

export default () => {
  const [pid, setPid] = useAtom(pidAtom);
  const [, setAppConfig] = useAtom(appConfigAtom);
  const [, setOpen] = useAtom(openAtom);
  const [script, setScript] = useAtom(scriptAtom);
  const [, setHint] = useAtom(hintAtom);
  const [, setPanelHTML] = useAtom(panelHTMLAtom);
  const appendLogLine = useSetAtom(appendToLogHTMLAtom);
  const [, setHidden] = useAtom(isHiddenAtom);
  const [, setChatMessages] = useAtom(chatMessagesAtom);

  const channel = useAtomValue(channelAtom);

  const setCss = useSetAtom(cssAtom);
  const addChatMessage = useSetAtom(addChatMessageAtom);
  const chatPushToken = useSetAtom(chatPushTokenAtom);
  const setChatMessage = useSetAtom(setChatMessageAtom);
  const setPromptBounds = useSetAtom(promptBoundsAtom);
  const setMicStreamEnabled = useSetAtom(micStreamEnabledAtom);

  const getEditorHistory = useSetAtom(getEditorHistoryAtom);
  const getColor = useAtomValue(colorAtom);

  const setExit = useSetAtom(exitAtom);
  const [input, setInput] = useAtom(inputAtom);
  const appendInput = useSetAtom(appendInputAtom);
  const setPlaceholder = useSetAtom(placeholderAtom);
  const [, setPromptData] = useAtom(promptDataAtom);
  const [, setTheme] = useAtom(themeAtom);
  const [, setTempTheme] = useAtom(tempThemeAtom);
  const setSplashBody = useSetAtom(splashBodyAtom);
  const setSplashHeader = useSetAtom(splashHeaderAtom);
  const setSplashProgress = useSetAtom(splashProgressAtom);
  const setChoicesConfig = useSetAtom(choicesConfigAtom);
  const setScoredChoices = useSetAtom(scoredChoicesAtom);
  const setSelectedChoices = useSetAtom(selectedChoicesAtom);
  const toggleAllSelectedChoices = useSetAtom(toggleAllSelectedChoicesAtom);
  const setScoredFlags = useSetAtom(scoredFlagsAtom);
  const setFooter = useSetAtom(footerAtom);
  const setEnter = useSetAtom(enterAtom);
  const setReady = useSetAtom(isReadyAtom);
  const setTabIndex = useSetAtom(tabIndexAtom);
  const setTabs = useSetAtom(tabsAtom);
  const [, setPreviewHTML] = useAtom(previewHTMLAtom);
  const setEditorConfig = useSetAtom(editorConfigAtom);
  const setEditorSuggestions = useSetAtom(editorSuggestionsAtom);
  const setEditorAppendValue = useSetAtom(editorAppendAtom);
  const setTextareaConfig = useSetAtom(textareaConfigAtom);
  const setFlags = useSetAtom(flagsAtom);
  const setActionsConfig = useSetAtom(actionsConfigAtom);

  const setSubmitValue = useSetAtom(submitValueAtom);
  const setDescription = useSetAtom(descriptionAtom);
  const setName = useSetAtom(nameAtom);
  const setTextareaValue = useSetAtom(textareaValueAtom);
  const setLoading = useSetAtom(loadingAtom);
  const setProgress = useSetAtom(progressAtom);
  const setRunning = useSetAtom(runningAtom);
  const setValueInvalid = useSetAtom(valueInvalidAtom);
  const setPreventSubmit = useSetAtom(preventSubmitAtom);
  const setBlur = useSetAtom(blurAtom);
  const setLogo = useSetAtom(logoAtom);

  const setFocused = useSetAtom(setFocusedChoiceAtom);
  const [, setBounds] = useAtom(boundsAtom);
  const setResizing = useSetAtom(resizingAtom);
  const setAudio = useSetAtom(audioAtom);
  const setSpeak = useSetAtom(speechAtom);
  const [, setKitState] = useAtom(kitStateAtom);
  const setLastLogLine = useSetAtom(lastLogLineAtom);
  const setLogValue = useSetAtom(logValueAtom);
  const setEditorLogMode = useSetAtom(editorLogModeAtom);
  const setShortcuts = useSetAtom(shortcutsAtom);
  const [, setFlagValue] = useAtom(flaggedChoiceValueAtom);
  const [, setTermConfig] = useAtom(termConfigAtom);
  const [micConfig, setMicConfig] = useAtom(micConfigAtom);
  const setTermExit = useSetAtom(termExitAtom);
  const setDevToolsOpen = useSetAtom(devToolsOpenAtom);
  const setResizeInflight = useSetAtom(resizeInflightAtom);
  const scrollToIndex = useAtomValue(scrollToIndexAtom);
  const setPreloaded = useSetAtom(preloadedAtom);
  const setTriggerKeyword = useSetAtom(triggerKeywordAtom);
  const setCachedMainScoredChoices = useSetAtom(cachedMainScoredChoicesAtom);
  const setCachedMainShortcuts = useSetAtom(cachedMainShortcutsAtom);
  const setCachedMainFlags = useSetAtom(cachedMainFlagsAtom);
  const initPrompt = useSetAtom(initPromptAtom);
  const setCachedMainPreview = useSetAtom(cachedMainPreviewAtom);
  const setTermFont = useSetAtom(termFontAtom);
  const setBeforeInput = useSetAtom(beforeInputAtom);
  const setKitConfig = useSetAtom(kitConfigAtom);
  const setShortcodes = useSetAtom(shortcodesAtom);
  const setInvalidateChoiceInputs = useSetAtom(invalidateChoiceInputsAtom);
  // log({
  //   previewCheck: previewCheck ? '✅' : '🚫',
  //   previewHTML: previewHTML?.length,
  //   panelHTML: panelHTML?.length,
  //   previewEnabled,
  //   hidden,
  // });

  const [, setZoom] = useAtom(zoomAtom);
  const setMicId = useSetAtom(micIdAtom);
  const setWebcamId = useSetAtom(webcamIdAtom);
  const setAudioDot = useSetAtom(audioDotAtom);
  const setTermOutput = useSetAtom(termOutputAtom);
  const setIsWindow = useSetAtom(isWindowAtom);
  const clearCache = useSetAtom(clearCacheAtom);
  const [init, setInit] = useState(false);
  const triggerResize = useSetAtom(triggerResizeAtom);

  useEffect(() => {
    log.info(`Setting up messages for ${pid}: ${init ? '✅' : '🚫'}`);
  }, [init]);

  type ChannelAtomMap = {
    [key in keyof ChannelMap]: (data: ChannelMap[key]) => void;
  };

  type ToastData = {
    text: Parameters<typeof toast>[0];
    options?: Parameters<typeof toast>[1];
  };

  const messageMap: ChannelAtomMap = {
    [Channel.SET_SHORTCODES]: setShortcodes,
    [Channel.APP_CONFIG]: setAppConfig,
    [Channel.EXIT]: setExit,
    [Channel.SET_PID]: (pid) => {
      toast.dismiss();
      setPid(pid);
    },
    [Channel.DEV_TOOLS]: setDevToolsOpen,
    [Channel.SET_PROMPT_BOUNDS]: setPromptBounds,
    [Channel.SET_SCRIPT]: setScript,
    [Channel.SET_CHOICES_CONFIG]: setChoicesConfig,
    [Channel.SET_SCORED_CHOICES]: setScoredChoices,
    [Channel.SET_SELECTED_CHOICES]: setSelectedChoices,
    [Channel.TOGGLE_ALL_SELECTED_CHOICES]: toggleAllSelectedChoices,
    [Channel.SET_SCORED_FLAGS]: setScoredFlags,
    [Channel.SET_DESCRIPTION]: setDescription,
    [Channel.SET_EDITOR_CONFIG]: setEditorConfig,
    [Channel.SET_EDITOR_SUGGESTIONS]: setEditorSuggestions,
    [Channel.APPEND_EDITOR_VALUE]: (value) => {
      flushSync(() => setEditorAppendValue(value));
    },
    [Channel.SET_TEXTAREA_CONFIG]: setTextareaConfig,
    [Channel.SET_FLAGS]: setFlags,
    [Channel.SET_ACTIONS_CONFIG]: setActionsConfig,
    [Channel.SET_FLAG_VALUE]: setFlagValue,
    [Channel.SET_FOCUSED]: setFocused,
    [Channel.SET_HINT]: (html) => setHint(DOMPurify.sanitize(html)),
    [Channel.SET_PANEL]: setPanelHTML,
    [Channel.SET_PREVIEW]: setPreviewHTML,
    [Channel.SET_FOOTER]: (html) => setFooter(DOMPurify.sanitize(html)),
    [Channel.SET_INPUT]: (value) => {
      console.log(JSON.stringify({
        source: 'useMessages_Channel.SET_INPUT',
        valueLength: value?.length || 0,
        valuePreview: value?.substring(0, 50) || '',
        timestamp: Date.now()
      }));
      setInput(value);
    },
    [Channel.GET_INPUT]: () => {
      channel(Channel.GET_INPUT, { value: input });
    },
    [Channel.APPEND_INPUT]: appendInput,
    [Channel.SET_LOADING]: setLoading,
    [Channel.SET_PROGRESS]: setProgress,
    [Channel.SET_RUNNING]: setRunning,
    [Channel.SET_NAME]: setName,
    [Channel.SET_TEXTAREA_VALUE]: setTextareaValue,
    [Channel.SET_OPEN]: setOpen,
    [Channel.SET_PROMPT_BLURRED]: setBlur,
    [Channel.SET_LOG]: appendLogLine,
    [Channel.SET_LOGO]: setLogo,
    [Channel.SET_PLACEHOLDER]: setPlaceholder,
    [Channel.SET_ENTER]: setEnter,
    [Channel.SET_READY]: setReady,
    [Channel.SET_SUBMIT_VALUE]: setSubmitValue,
    [Channel.SET_TAB_INDEX]: (idx) => {
      setTabIndex(idx);
      // Tabs can change visible content height; request a measurement
      triggerResize('TABS');
    },
    [Channel.SET_PROMPT_DATA]: (data) => {
      setPromptData(data);
      triggerResize('UI');
    },
    [Channel.SET_SPLASH_BODY]: setSplashBody,
    [Channel.SET_SPLASH_HEADER]: setSplashHeader,
    [Channel.SET_SPLASH_PROGRESS]: setSplashProgress,
    [Channel.SET_THEME]: debounce((theme) => {
      log.verbose(`${window.pid}: 🐠 Channel.SET_THEME`, theme);
      setTheme(theme);
      triggerResize('THEME');
    }, 50),
    [Channel.SET_TEMP_THEME]: setTempTheme,
    [Channel.VALUE_INVALID]: setValueInvalid,
    [Channel.PREVENT_SUBMIT]: setPreventSubmit,
    [Channel.GET_EDITOR_HISTORY]: getEditorHistory,
    [Channel.GET_COLOR]: () => getColor(),
    [Channel.CLEAR_TABS]: setTabs,
    [Channel.SET_BOUNDS]: setBounds,
    [Channel.SET_RESIZING]: setResizing,
    [Channel.PLAY_AUDIO]: setAudio,
    [Channel.STOP_AUDIO]: () => setAudio(null),
    [Channel.SPEAK_TEXT]: setSpeak,
    [Channel.SET_SHORTCUTS]: setShortcuts,
    [Channel.CHAT_SET_MESSAGES]: setChatMessages,
    [Channel.CHAT_ADD_MESSAGE]: addChatMessage,
    [Channel.CHAT_PUSH_TOKEN]: chatPushToken,
    [Channel.CHAT_SET_MESSAGE]: setChatMessage,
    [Channel.MIC_STREAM]: setMicStreamEnabled,
    [Channel.SET_INVALIDATE_CHOICE_INPUTS]: setInvalidateChoiceInputs,
    [Channel.START_MIC]: (config: any) => {
      setAudioDot(true);
      const finalConfig = {
        ...micConfig,
        ...config,
      };
      setMicConfig(finalConfig);
    },
    [Channel.HIDE_APP]: () => {
      setHidden(true);
    },

    [Channel.TOAST]: ({ text, options }: ToastData) => {
      toast(text, options);
    },
    [Channel.GET_DEVICES]: async () => {
      const devices = await navigator.mediaDevices.enumerateDevices();

      // convert to a plain object
      const value = devices.map((d) => d.toJSON());

      channel(Channel.GET_DEVICES, { value });
    },

    [Channel.SEND_KEYSTROKE]: (keyData: Partial<KeyData>) => {
      const keyboardEvent = new KeyboardEvent('keydown', {
        bubbles: true,
        ctrlKey: keyData.command || keyData.control,
        shiftKey: keyData.shift,
        altKey: keyData.option,
        ...keyData,
      } as any);

      document?.activeElement?.dispatchEvent(keyboardEvent);
    },
    [Channel.TERM_EXIT]: setTermExit,
    [Channel.SET_FORM_DATA]: (data) => {
      Object.entries(data).forEach(([key, value]) => {
        const inputElement = document.querySelector(`.kit-form input[data-name="${key}"]`);

        if (inputElement) {
          (inputElement as HTMLInputElement).value = value as string;
          // log({
          //   key,
          //   value,
          // });
        }
      });
    },

    [WindowChannel.SET_LAST_LOG_LINE]: setLastLogLine,
    [WindowChannel.SET_LOG_VALUE]: setLogValue,
    [WindowChannel.SET_EDITOR_LOG_MODE]: setEditorLogMode,
    [AppChannel.TRIGGER_RESIZE]: () => {
      try { (window as any).DEBUG_RESIZE && console.log('[RESIZE] MAIN_ACK'); } catch {}
      setResizeInflight(false);
      triggerResize('MAIN_ACK');
    },
  };

  useEffect(() => {
    log.info(`>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>> 🔑 Setting up message listeners for ${pid}`);
    Object.entries(messageMap).forEach(([key, fn]) => {
      if (ipcRenderer.listenerCount(key) === 0) {
        ipcRenderer.on(key, (_, data) => {
          // log.info(`🔑 ${script.filePath}:  Received ${key} message`);
          // if (data?.kitScript) setScriptName(data?.kitScript);
          // log(`>>>>>>>>>>>>>>>> 🔑 Received ${key} message`);
          // if (!key) {
          //   log({ data });
          // }

          (fn as (data: ChannelAtomMap[keyof ChannelAtomMap]) => void)(data);
        });
      }
    });

    const kitStateCallback = (_, data) => {
      log.info('KIT_STATE received', data);
      setKitState(data);
    };

    if (ipcRenderer.listenerCount(AppChannel.KIT_STATE) === 0) {
      ipcRenderer.on(AppChannel.KIT_STATE, kitStateCallback);
    }

    const handleTermConfig: (event: Electron.IpcRendererEvent, ...args: any[]) => void = (_, data) => {
      setTermConfig(data);
    };

    if (ipcRenderer.listenerCount(AppChannel.SET_TERM_CONFIG) === 0) {
      ipcRenderer.on(AppChannel.SET_TERM_CONFIG, handleTermConfig);
    }

    const handleMicConfig: (event: Electron.IpcRendererEvent, ...args: any[]) => void = (_, data) => {
      log.info('Setting mic config:', data);
      setMicConfig(data);
    };

    if (ipcRenderer.listenerCount(AppChannel.SET_MIC_CONFIG) === 0) {
      ipcRenderer.on(AppChannel.SET_MIC_CONFIG, handleMicConfig);
    }

    type HandleCSSVariableHandler = (
      event: Electron.IpcRendererEvent,
      data: {
        name: string;
        value: string;
      },
    ) => void;

    const handleCSSVariable: HandleCSSVariableHandler = (_, data) => {
      try {
        log.verbose(
          `Changing ${data?.name} from`,
          document.documentElement.style.getPropertyValue(data?.name),
          'to',
          data?.value,
        );
        document.documentElement.style.setProperty(data?.name, data?.value);
        // eslint-disable-next-line no-void
        void document.body.offsetHeight;
        // Theme variable changes can impact layout; schedule measurement
        triggerResize('THEME');
      } catch (e) {
        log.error('Error changing CSS variable:', e);
      }
    };

    if (ipcRenderer.listenerCount(AppChannel.CSS_VARIABLE) === 0) {
      ipcRenderer.on(AppChannel.CSS_VARIABLE, handleCSSVariable);
    }

    const handleTermExit = (_: any, data: string) => {
      setTermExit(data);
    };

    if (ipcRenderer.listenerCount(AppChannel.TERM_EXIT) === 0) {
      ipcRenderer.on(AppChannel.TERM_EXIT, handleTermExit);
    }

    const handleZoom = (_, data) => {
      setZoom(data);
      // Zoom affects measured bounds; schedule a resize with explicit reason
      triggerResize('ZOOM');
    };

    if (ipcRenderer.listenerCount(AppChannel.ZOOM) === 0) {
      ipcRenderer.on(AppChannel.ZOOM, handleZoom);
    }

    const handleSetMicId = (_, data: string) => {
      setMicId(data);
    };

    if (ipcRenderer.listenerCount(AppChannel.SET_MIC_ID) === 0) {
      ipcRenderer.on(AppChannel.SET_MIC_ID, handleSetMicId);
    }

    const handleSetWebcamId = (_, data: string) => {
      setWebcamId(data);
    };

    if (ipcRenderer.listenerCount(AppChannel.SET_WEBCAM_ID) === 0) {
      ipcRenderer.on(AppChannel.SET_WEBCAM_ID, handleSetWebcamId);
    }

    // const handleSetBounds = (_, data: any) => {
    //   requestAnimationFrame(() => {
    //     window?.resizeTo(data?.width, data?.height);
    //     document.documentElement.style.width = `${data?.width}px`;
    //     document.documentElement.style.height = `${data?.height}px`;
    //     document.body.style.width = `${data?.width}px`;
    //     document.body.style.height = `${data?.height}px`;
    //     document.getElementById('root')!.style.width = `${data?.width}px`;
    //     document.getElementById('root')!.style.height = `${data?.height}px`;
    //   });
    // };

    // ipcRenderer.on(AppChannel.SET_BOUNDS, handleSetBounds);

    const handleScrollToIndex = (_, index: number) => {
      scrollToIndex(index);
    };
    if (ipcRenderer.listenerCount(AppChannel.SCROLL_TO_INDEX) === 0) {
      ipcRenderer.on(AppChannel.SCROLL_TO_INDEX, handleScrollToIndex);
    }

    const handleSetPreloaded = (_, data: boolean) => {
      setPreloaded(data);
    };

    if (ipcRenderer.listenerCount(AppChannel.SET_PRELOADED) === 0) {
      ipcRenderer.on(AppChannel.SET_PRELOADED, handleSetPreloaded);
    }

    const handleTriggerKeyword = (
      _,
      data: {
        keyword: string;
        choice: Choice;
      },
    ) => {
      setTriggerKeyword(data);
    };

    if (ipcRenderer.listenerCount(AppChannel.TRIGGER_KEYWORD) === 0) {
      ipcRenderer.on(AppChannel.TRIGGER_KEYWORD, handleTriggerKeyword);
    }

    const handleForceRender = () => {
      setInit(true);
    };

    if (ipcRenderer.listenerCount(AppChannel.FORCE_RENDER) === 0) {
      ipcRenderer.on(AppChannel.FORCE_RENDER, handleForceRender);
    }

    const handleSetCachedMainState = (_, data: {
      choices: any[];
      shortcuts: any[];
      scriptFlags: any;
      preview: string;
      timestamp: number;
    }) => {
      log.info(`[SCRIPTS RENDER] Renderer ${window.pid} received atomic state update at ${data.timestamp}`);
      // Update all state atomically
      setCachedMainScoredChoices(data.choices);
      setCachedMainShortcuts(data.shortcuts);
      setCachedMainFlags(data.scriptFlags);
      setCachedMainPreview(data.preview);
      log.info(`[SCRIPTS RENDER] Renderer ${window.pid} completed atomic state update`);
    };

    if (ipcRenderer.listenerCount(AppChannel.SET_CACHED_MAIN_STATE) === 0) {
      ipcRenderer.on(AppChannel.SET_CACHED_MAIN_STATE, handleSetCachedMainState);
    }

    // Keep legacy handlers for backward compatibility
    const handleSetCachedMainScoredChoices = (_, data) => {
      log.info(`[SCRIPTS RENDER] Renderer ${window.pid} received legacy SET_CACHED_MAIN_SCORED_CHOICES`);
      setCachedMainScoredChoices(data);
    };

    if (ipcRenderer.listenerCount(AppChannel.SET_CACHED_MAIN_SCORED_CHOICES) === 0) {
      ipcRenderer.on(AppChannel.SET_CACHED_MAIN_SCORED_CHOICES, handleSetCachedMainScoredChoices);
    }

    const handleSetCachedMainShortcuts = (_, data) => {
      log.info(`[SCRIPTS RENDER] Renderer ${window.pid} received legacy SET_CACHED_MAIN_SHORTCUTS`);
      setCachedMainShortcuts(data);
    };

    if (ipcRenderer.listenerCount(AppChannel.SET_CACHED_MAIN_SHORTCUTS) === 0) {
      ipcRenderer.on(AppChannel.SET_CACHED_MAIN_SHORTCUTS, handleSetCachedMainShortcuts);
    }

    const handleSetCachedMainPreview = (_, data) => {
      log.info(`[SCRIPTS RENDER] Renderer ${window.pid} received legacy SET_CACHED_MAIN_PREVIEW`);
      setCachedMainPreview(data);
    };

    if (ipcRenderer.listenerCount(AppChannel.SET_CACHED_MAIN_PREVIEW) === 0) {
      ipcRenderer.on(AppChannel.SET_CACHED_MAIN_PREVIEW, handleSetCachedMainPreview);
    }

    const handleSetCachedMainFlags = (_, data) => {
      log.info(`[SCRIPTS RENDER] Renderer ${window.pid} received legacy SET_CACHED_MAIN_SCRIPT_FLAGS`);
      setCachedMainFlags(data);
    };

    if (ipcRenderer.listenerCount(AppChannel.SET_CACHED_MAIN_SCRIPT_FLAGS) === 0) {
      ipcRenderer.on(AppChannel.SET_CACHED_MAIN_SCRIPT_FLAGS, handleSetCachedMainFlags);
    }

    const handleInitPrompt = (_, _data) => {
      log.info(`${pid}: Received init prompt message`);
      initPrompt();
    };

    if (ipcRenderer.listenerCount(AppChannel.INIT_PROMPT) === 0) {
      ipcRenderer.on(AppChannel.INIT_PROMPT, handleInitPrompt);
    }

    const handleSetTermFont = (_, data) => {
      setTermFont(data);
    };

    if (ipcRenderer.listenerCount(AppChannel.SET_TERM_FONT) === 0) {
      ipcRenderer.on(AppChannel.SET_TERM_FONT, handleSetTermFont);
    }

    const handleBeforeInputEvent = (_, data) => {
      setBeforeInput(data?.key);
    };

    if (ipcRenderer.listenerCount(AppChannel.BEFORE_INPUT_EVENT) === 0) {
      ipcRenderer.on(AppChannel.BEFORE_INPUT_EVENT, handleBeforeInputEvent);
    }

    const handleCssChanged = (_, data) => {
      log.info('CSS changed:', data);
      setCss(data);
    };

    if (ipcRenderer.listenerCount(AppChannel.CSS_CHANGED) === 0) {
      ipcRenderer.on(AppChannel.CSS_CHANGED, handleCssChanged);
    }

    const handleClearCache = (_, _data) => {
      clearCache();
    };

    if (ipcRenderer.listenerCount(AppChannel.CLEAR_CACHE) === 0) {
      ipcRenderer.on(AppChannel.CLEAR_CACHE, handleClearCache);
    }

    const handleInputReady = (_event, _data) => {
      let rafId: number;
      const timeoutId = setTimeout(() => {
        log.warn(`Timeout reached after 250ms for element with id: "input"`);
        ipcRenderer.send(AppChannel.INPUT_READY);
        cancelAnimationFrame(rafId);
      }, 250);

      const checkElement = () => {
        log.info('Checking for input');
        if (document.getElementById('input')) {
          clearTimeout(timeoutId);
          log.info('Input found');
          ipcRenderer.send(AppChannel.INPUT_READY);
        } else {
          rafId = requestAnimationFrame(checkElement);
        }
      };

      rafId = requestAnimationFrame(checkElement);
    };
    ipcRenderer.once(AppChannel.INPUT_READY, handleInputReady);

    const config = ipcRenderer.sendSync(AppChannel.GET_KIT_CONFIG);
    window.pid = config.pid;

    setKitConfig(config);

    log.info(`Sending messages ready for ${pid} with ${window.pid}`);
    ipcRenderer.send(AppChannel.MESSAGES_READY, window.pid);

    const handleMakeWindow = (_, data: boolean) => {
      log.info('Received make window message');
      setIsWindow(data);
    };

    if (ipcRenderer.listenerCount(AppChannel.MAKE_WINDOW) === 0) {
      ipcRenderer.on(AppChannel.MAKE_WINDOW, handleMakeWindow);
    }

    return () => {
      log.info(`🔑 Removing message listeners for ${pid}`);

      Object.entries(messageMap).forEach(([key, fn]) => {
        ipcRenderer.off(key, fn);
      });

      ipcRenderer.off(AppChannel.KIT_STATE, kitStateCallback);
      ipcRenderer.off(AppChannel.CSS_VARIABLE, handleCSSVariable);
      ipcRenderer.off(AppChannel.SET_TERM_CONFIG, handleTermConfig);
      ipcRenderer.off(AppChannel.ZOOM, handleZoom);
      ipcRenderer.off(AppChannel.TERM_EXIT, handleTermExit);
      ipcRenderer.off(AppChannel.SET_MIC_ID, handleSetMicId);
      ipcRenderer.off(AppChannel.SET_WEBCAM_ID, handleSetWebcamId);
      ipcRenderer.off(AppChannel.SCROLL_TO_INDEX, handleScrollToIndex);
      ipcRenderer.off(AppChannel.SET_PRELOADED, handleSetPreloaded);
      ipcRenderer.off(AppChannel.TRIGGER_KEYWORD, handleTriggerKeyword);
      ipcRenderer.off(AppChannel.SET_CACHED_MAIN_STATE, handleSetCachedMainState);
      ipcRenderer.off(AppChannel.SET_CACHED_MAIN_SCORED_CHOICES, handleSetCachedMainScoredChoices);
      ipcRenderer.off(AppChannel.SET_CACHED_MAIN_SHORTCUTS, handleSetCachedMainShortcuts);
      ipcRenderer.off(AppChannel.SET_CACHED_MAIN_PREVIEW, handleSetCachedMainPreview);
      // ipcRenderer.off(AppChannel.SET_BOUNDS, handleSetBounds);
      ipcRenderer.off(AppChannel.SET_TERM_FONT, handleSetTermFont);
      ipcRenderer.off(AppChannel.BEFORE_INPUT_EVENT, handleBeforeInputEvent);
      ipcRenderer.off(AppChannel.CSS_CHANGED, handleCssChanged);
      ipcRenderer.off(AppChannel.INIT_PROMPT, handleInitPrompt);
      ipcRenderer.off(AppChannel.SET_CACHED_MAIN_SCRIPT_FLAGS, handleSetCachedMainFlags);
      ipcRenderer.off(AppChannel.CLEAR_CACHE, handleClearCache);
      ipcRenderer.off(AppChannel.FORCE_RENDER, handleForceRender);
      ipcRenderer.off(AppChannel.MAKE_WINDOW, handleMakeWindow);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pid]);
};
