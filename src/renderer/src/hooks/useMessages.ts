import { useEffect } from 'react';
import { toast } from 'react-toastify';
import DOMPurify from 'dompurify';
import log from 'electron-log/renderer';
import { useAtom, useSetAtom, useAtomValue } from 'jotai';
const { ipcRenderer } = window.electron;
import { Channel } from '@johnlindquist/kit/core/enum';
import { ChannelMap, KeyData } from '@johnlindquist/kit/types/kitapp';
import { Choice } from '@johnlindquist/kit/types';
import {
  editorConfigAtom,
  editorSuggestionsAtom,
  flagsAtom,
  hintAtom,
  inputAtom,
  logHTMLAtom,
  openAtom,
  panelHTMLAtom,
  pidAtom,
  placeholderAtom,
  previewHTMLAtom,
  promptDataAtom,
  scriptAtom,
  submitValueAtom,
  tabIndexAtom,
  tabsAtom,
  textareaConfigAtom,
  tempThemeAtom,
  choicesConfigAtom,
  descriptionAtom,
  nameAtom,
  textareaValueAtom,
  loadingAtom,
  exitAtom,
  appConfigAtom,
  splashBodyAtom,
  splashHeaderAtom,
  splashProgressAtom,
  isReadyAtom,
  valueInvalidAtom,
  isHiddenAtom,
  _history,
  blurAtom,
  startAtom,
  logoAtom,
  getEditorHistoryAtom,
  scoredChoicesAtom,
  setFocusedChoiceAtom,
  footerAtom,
  boundsAtom,
  resizingAtom,
  themeAtom,
  audioAtom,
  speechAtom,
  enterAtom,
  kitStateAtom,
  lastLogLineAtom,
  editorLogModeAtom,
  logValueAtom,
  shortcutsAtom,
  editorAppendAtom,
  appDbAtom,
  colorAtom,
  chatMessagesAtom,
  addChatMessageAtom,
  chatPushTokenAtom,
  setChatMessageAtom,
  termConfigAtom,
  zoomAtom,
  termExitAtom,
  appendInputAtom,
  micIdAtom,
  webcamIdAtom,
  runningAtom,
  micConfigAtom,
  promptBoundsAtom,
  audioDotAtom,
  scrollToIndexAtom,
  scoredFlagsAtom,
  flaggedChoiceValueAtom,
  preloadedAtom,
  triggerKeywordAtom,
  preventSubmitAtom,
  selectedChoicesAtom,
  toggleAllSelectedChoicesAtom,
  resetPromptAtom,
  cachedMainScoredChoicesAtom,
  cachedMainShortcutsAtom,
  cachedMainPreviewAtom,
  termFontAtom,
  micStreamEnabledAtom,
  progressAtom,
  channelAtom,
  beforeInputAtom,
  cssAtom,
  initPromptAtom,
  cachedMainFlagsAtom,
} from '../jotai';

import { AppChannel, WindowChannel } from '../../../shared/enums';

export default () => {
  const [pid, setPid] = useAtom(pidAtom);
  const [, setAppConfig] = useAtom(appConfigAtom);
  const [, setAppDb] = useAtom(appDbAtom);
  const [, setOpen] = useAtom(openAtom);
  const [, setScript] = useAtom(scriptAtom);
  const [, setHint] = useAtom(hintAtom);
  const [, setPanelHTML] = useAtom(panelHTMLAtom);
  const [, setLogHtml] = useAtom(logHTMLAtom);
  const [, setHidden] = useAtom(isHiddenAtom);
  const [, setChatMessages] = useAtom(chatMessagesAtom);

  const channel = useAtomValue(channelAtom);

  const setCss = useSetAtom(cssAtom);
  const addChatMessage = useSetAtom(addChatMessageAtom);
  const chatPushToken = useSetAtom(chatPushTokenAtom);
  const setChatMessage = useSetAtom(setChatMessageAtom);
  const setPromptBounds = useSetAtom(promptBoundsAtom);
  const setMicStreamEnabled = useSetAtom(micStreamEnabledAtom);

  const getEditorHistory = useAtomValue(getEditorHistoryAtom);
  const getColor = useAtomValue(colorAtom);

  const setExit = useSetAtom(exitAtom);
  const setScriptHistory = useSetAtom(_history);
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
  const start = useSetAtom(startAtom);
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
  const scrollToIndex = useAtomValue(scrollToIndexAtom);
  const setPreloaded = useSetAtom(preloadedAtom);
  const setTriggerKeyword = useSetAtom(triggerKeywordAtom);
  const resetPrompt = useSetAtom(resetPromptAtom);
  const setCachedMainScoredChoices = useSetAtom(cachedMainScoredChoicesAtom);
  const setCachedMainShortcuts = useSetAtom(cachedMainShortcutsAtom);
  const setCachedMainFlags = useSetAtom(cachedMainFlagsAtom);
  const initPrompt = useSetAtom(initPromptAtom);
  const setCachedMainPreview = useSetAtom(cachedMainPreviewAtom);
  const setTermFont = useSetAtom(termFontAtom);
  const setBeforeInput = useSetAtom(beforeInputAtom);
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

  type ChannelAtomMap = {
    [key in keyof ChannelMap]: (data: ChannelMap[key]) => void;
  };

  type ToastData = {
    text: Parameters<typeof toast>[0];
    options?: Parameters<typeof toast>[1];
  };

  const messageMap: ChannelAtomMap = {
    [Channel.APP_CONFIG]: setAppConfig,
    [Channel.APP_DB]: setAppDb,
    [Channel.EXIT]: setExit,
    [Channel.SET_PID]: (pid) => {
      toast.dismiss();
      setPid(pid);
    },
    [Channel.SET_PROMPT_BOUNDS]: setPromptBounds,
    [Channel.SET_SCRIPT]: setScript,
    [Channel.SET_SCRIPT_HISTORY]: setScriptHistory,
    [Channel.SET_CHOICES_CONFIG]: setChoicesConfig,
    [Channel.SET_SCORED_CHOICES]: setScoredChoices,
    [Channel.SET_SELECTED_CHOICES]: setSelectedChoices,
    [Channel.TOGGLE_ALL_SELECTED_CHOICES]: toggleAllSelectedChoices,
    [Channel.SET_SCORED_FLAGS]: setScoredFlags,
    [Channel.SET_DESCRIPTION]: setDescription,
    [Channel.SET_EDITOR_CONFIG]: setEditorConfig,
    [Channel.SET_EDITOR_SUGGESTIONS]: setEditorSuggestions,
    [Channel.APPEND_EDITOR_VALUE]: setEditorAppendValue,
    [Channel.SET_TEXTAREA_CONFIG]: setTextareaConfig,
    [Channel.SET_FLAGS]: setFlags,
    [Channel.SET_FLAG_VALUE]: setFlagValue,
    [Channel.SET_FOCUSED]: setFocused,
    [Channel.SET_HINT]: (html) => setHint(DOMPurify.sanitize(html)),
    [Channel.SET_PANEL]: setPanelHTML,
    [Channel.SET_PREVIEW]: setPreviewHTML,
    [Channel.SET_FOOTER]: (html) => setFooter(DOMPurify.sanitize(html)),
    [Channel.SET_INPUT]: setInput,
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
    [Channel.SET_LOG]: setLogHtml,
    [Channel.SET_LOGO]: setLogo,
    [Channel.SET_PLACEHOLDER]: setPlaceholder,
    [Channel.SET_ENTER]: setEnter,
    [Channel.SET_READY]: setReady,
    [Channel.SET_SUBMIT_VALUE]: setSubmitValue,
    [Channel.SET_TAB_INDEX]: setTabIndex,
    [Channel.SET_PROMPT_DATA]: setPromptData,
    [Channel.SET_SPLASH_BODY]: setSplashBody,
    [Channel.SET_SPLASH_HEADER]: setSplashHeader,
    [Channel.SET_SPLASH_PROGRESS]: setSplashProgress,
    [Channel.SET_THEME]: setTheme,
    [Channel.SET_TEMP_THEME]: setTempTheme,
    [Channel.VALUE_INVALID]: setValueInvalid,
    [Channel.PREVENT_SUBMIT]: setPreventSubmit,
    [Channel.START]: start,
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
    [Channel.START_MIC]: (config: any) => {
      setAudioDot(true);
      setMicConfig({
        ...micConfig,
        ...config,
      });
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
        const inputElement = document.querySelector(
          `.kit-form input[data-name="${key}"]`
        );

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
  };

  useEffect(() => {
    log.info(
      `>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>> 🔑 Setting up message listeners`
    );
    Object.entries(messageMap).forEach(([key, fn]) => {
      if (ipcRenderer.listenerCount(key) === 0) {
        ipcRenderer.on(key, (_, data) => {
          log.silly(`🔑 Received ${key} message`);
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
      setKitState(data);
    };

    if (ipcRenderer.listenerCount(AppChannel.KIT_STATE) === 0)
      ipcRenderer.on(AppChannel.KIT_STATE, kitStateCallback);

    const handleTermConfig: (
      event: Electron.IpcRendererEvent,
      ...args: any[]
    ) => void = (_, data) => {
      setTermConfig(data);
    };

    if (ipcRenderer.listenerCount(AppChannel.SET_TERM_CONFIG) === 0)
      ipcRenderer.on(AppChannel.SET_TERM_CONFIG, handleTermConfig);

    const handleMicConfig: (
      event: Electron.IpcRendererEvent,
      ...args: any[]
    ) => void = (_, data) => {
      log.info(`Setting mic config:`, data);
      setMicConfig(data);
    };

    if (ipcRenderer.listenerCount(AppChannel.SET_MIC_CONFIG) === 0)
      ipcRenderer.on(AppChannel.SET_MIC_CONFIG, handleMicConfig);

    type HandleCSSVariableHandler = (
      event: Electron.IpcRendererEvent,
      data: {
        name: string;
        value: string;
      }
    ) => void;

    const handleCSSVariable: HandleCSSVariableHandler = (_, data) => {
      try {
        log.verbose(
          `Changing ${data?.name} from`,
          document.documentElement.style.getPropertyValue(data?.name),
          `to`,
          data?.value
        );
        document.documentElement.style.setProperty(data?.name, data?.value);
        // eslint-disable-next-line no-void
        void document.body.offsetHeight;
      } catch (e) {
        log.error(`Error changing CSS variable:`, e);
      }
    };

    if (ipcRenderer.listenerCount(AppChannel.CSS_VARIABLE) === 0)
      ipcRenderer.on(AppChannel.CSS_VARIABLE, handleCSSVariable);

    const handleTermExit = (_: any, data: string) => {
      setTermExit(data);
    };

    if (ipcRenderer.listenerCount(AppChannel.TERM_EXIT) === 0)
      ipcRenderer.on(AppChannel.TERM_EXIT, handleTermExit);

    const handleZoom = (_, data) => {
      setZoom(data);
    };

    if (ipcRenderer.listenerCount(AppChannel.ZOOM) === 0)
      ipcRenderer.on(AppChannel.ZOOM, handleZoom);

    const handleSetMicId = (_, data: string) => {
      setMicId(data);
    };

    if (ipcRenderer.listenerCount(AppChannel.SET_MIC_ID) === 0)
      ipcRenderer.on(AppChannel.SET_MIC_ID, handleSetMicId);

    const handleSetWebcamId = (_, data: string) => {
      setWebcamId(data);
    };

    if (ipcRenderer.listenerCount(AppChannel.SET_WEBCAM_ID) === 0)
      ipcRenderer.on(AppChannel.SET_WEBCAM_ID, handleSetWebcamId);

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
      }
    ) => {
      setTriggerKeyword(data);
    };

    if (ipcRenderer.listenerCount(AppChannel.TRIGGER_KEYWORD) === 0) {
      ipcRenderer.on(AppChannel.TRIGGER_KEYWORD, handleTriggerKeyword);
    }

    const handleResetPrompt = () => {
      resetPrompt();
    };

    if (ipcRenderer.listenerCount(AppChannel.RESET_PROMPT) === 0) {
      ipcRenderer.on(AppChannel.RESET_PROMPT, handleResetPrompt);
    }

    const handleSetCachedMainScoredChoices = (_, data) => {
      setCachedMainScoredChoices(data);
    };

    if (
      ipcRenderer.listenerCount(AppChannel.SET_CACHED_MAIN_SCORED_CHOICES) === 0
    ) {
      ipcRenderer.on(
        AppChannel.SET_CACHED_MAIN_SCORED_CHOICES,
        handleSetCachedMainScoredChoices
      );
    }

    const handleSetCachedMainShortcuts = (_, data) => {
      setCachedMainShortcuts(data);
    };

    if (ipcRenderer.listenerCount(AppChannel.SET_CACHED_MAIN_SHORTCUTS) === 0) {
      ipcRenderer.on(
        AppChannel.SET_CACHED_MAIN_SHORTCUTS,
        handleSetCachedMainShortcuts
      );
    }

    const handleSetCachedMainPreview = (_, data) => {
      setCachedMainPreview(data);
    };

    if (ipcRenderer.listenerCount(AppChannel.SET_CACHED_MAIN_PREVIEW) === 0) {
      ipcRenderer.on(
        AppChannel.SET_CACHED_MAIN_PREVIEW,
        handleSetCachedMainPreview
      );
    }

    const handleSetCachedMainFlags = (_, data) => {
      setCachedMainFlags(data);
    };

    if (
      ipcRenderer.listenerCount(AppChannel.SET_CACHED_MAIN_SCRIPT_FLAGS) === 0
    ) {
      ipcRenderer.on(
        AppChannel.SET_CACHED_MAIN_SCRIPT_FLAGS,
        handleSetCachedMainFlags
      );
    }

    const handleInitPrompt = (_, data) => {
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
      log.info(`CSS changed:`, data);
      setCss(data);
    };

    if (ipcRenderer.listenerCount(AppChannel.CSS_CHANGED) === 0) {
      ipcRenderer.on(AppChannel.CSS_CHANGED, handleCssChanged);
    }

    ipcRenderer.send(AppChannel.MESSAGES_READY, pid);

    return () => {
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
      ipcRenderer.off(AppChannel.RESET_PROMPT, handleResetPrompt);
      ipcRenderer.off(
        AppChannel.SET_CACHED_MAIN_SCORED_CHOICES,
        handleSetCachedMainScoredChoices
      );
      ipcRenderer.off(
        AppChannel.SET_CACHED_MAIN_SHORTCUTS,
        handleSetCachedMainShortcuts
      );
      ipcRenderer.off(
        AppChannel.SET_CACHED_MAIN_PREVIEW,
        handleSetCachedMainPreview
      );
      // ipcRenderer.off(AppChannel.SET_BOUNDS, handleSetBounds);
      ipcRenderer.off(AppChannel.SET_TERM_FONT, handleSetTermFont);
      ipcRenderer.off(AppChannel.BEFORE_INPUT_EVENT, handleBeforeInputEvent);
      ipcRenderer.off(AppChannel.CSS_CHANGED, handleCssChanged);
      ipcRenderer.off(AppChannel.INIT_PROMPT, handleInitPrompt);
      ipcRenderer.off(
        AppChannel.SET_CACHED_MAIN_SCRIPT_FLAGS,
        handleSetCachedMainFlags
      );
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
};
