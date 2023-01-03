import { useEffect, useRef, memo } from 'react';

import {
  AppChannel,
  Channel,
  UI,
  WindowChannel,
} from '@johnlindquist/kit/core/enum';

import type { ChannelMap, KeyData } from '@johnlindquist/kit/types/kitapp';

import { useAtom, useSetAtom, useAtomValue } from 'jotai';

import { ipcRenderer } from 'electron';

import {
  editorConfigAtom,
  editorSuggestionsAtom,
  flagsAtom,
  inputAtom,
  logHTMLAtom,
  openAtom,
  uiAtom,
  panelHTMLAtom,
  pidAtom,
  placeholderAtom,
  previewHTMLAtom,
  promptDataAtom,
  submitValueAtom,
  tabIndexAtom,
  tabsAtom,
  textareaConfigAtom,
  tempThemeAtom,
  unfilteredChoicesAtom,
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
  _history,
  filterInputAtom,
  blurAtom,
  startAtom,
  logoAtom,
  getEditorHistoryAtom,
  processesAtom,
  setFocusedChoiceAtom,
  socketURLAtom,
  footerAtom,
  addChoiceAtom,
  appearanceAtom,
  boundsAtom,
  resizingAtom,
  themeAtom,
  audioAtom,
  speechAtom,
  enterAtom,
  kitStateAtom,
  userAtom,
  lastLogLineAtom,
  editorLogModeAtom,
  logValueAtom,
  shortcutsAtom,
  editorAppendAtom,
  scriptAtom,
} from './jotai';
import DOMPurify from 'dompurify';

const Bridge = memo(() => {
  console.log(`Bridge: Rendered`);
  const getEditorHistory = useAtomValue(getEditorHistoryAtom);

  const [appConfig, setAppConfig] = useAtom(appConfigAtom);
  const setPid = useSetAtom(pidAtom);
  const [script, setScript] = useAtom(scriptAtom);
  const setExit = useSetAtom(exitAtom);
  const setScriptHistory = useSetAtom(_history);
  const [input, setInput] = useAtom(inputAtom);
  const setPlaceholder = useSetAtom(placeholderAtom);
  const [promptData, setPromptData] = useAtom(promptDataAtom);
  const setTheme = useSetAtom(themeAtom);
  const setTempTheme = useSetAtom(tempThemeAtom);
  const setSplashBody = useSetAtom(splashBodyAtom);
  const setSplashHeader = useSetAtom(splashHeaderAtom);
  const setSplashProgress = useSetAtom(splashProgressAtom);
  const setUnfilteredChoices = useSetAtom(unfilteredChoicesAtom);
  const setFooter = useSetAtom(footerAtom);
  const setEnter = useSetAtom(enterAtom);
  const setReady = useSetAtom(isReadyAtom);
  const setTabIndex = useSetAtom(tabIndexAtom);
  const setTabs = useSetAtom(tabsAtom);
  const addChoice = useSetAtom(addChoiceAtom);
  const setPreviewHTML = useSetAtom(previewHTMLAtom);
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
  const setValueInvalid = useSetAtom(valueInvalidAtom);
  const setFilterInput = useSetAtom(filterInputAtom);
  const setBlur = useSetAtom(blurAtom);
  const start = useSetAtom(startAtom);
  const setLogo = useSetAtom(logoAtom);
  const setProcesses = useSetAtom(processesAtom);
  const setUser = useSetAtom(userAtom);
  const setFocused = useSetAtom(setFocusedChoiceAtom);
  const setSocketURL = useSetAtom(socketURLAtom);
  const setAppearance = useSetAtom(appearanceAtom);
  const [bounds, setBounds] = useAtom(boundsAtom);
  const setResizing = useSetAtom(resizingAtom);
  const setAudio = useSetAtom(audioAtom);
  const setSpeak = useSetAtom(speechAtom);
  const setKitState = useSetAtom(kitStateAtom);
  const setLastLogLine = useSetAtom(lastLogLineAtom);
  const setLogValue = useSetAtom(logValueAtom);
  const setEditorLogMode = useSetAtom(editorLogModeAtom);
  const setShortcuts = useSetAtom(shortcutsAtom);
  const [panelHTML, setPanelHTML] = useAtom(panelHTMLAtom);
  const [logHtml, setLogHtml] = useAtom(logHTMLAtom);
  const [open, setOpen] = useAtom(openAtom);

  const [ui] = useAtom(uiAtom);

  type ChannelAtomMap = {
    [key in keyof ChannelMap]: (data: ChannelMap[key]) => void;
  };

  type WindowChannelMap = {
    [WindowChannel.SET_LAST_LOG_LINE]: string;
    [WindowChannel.SET_LOG_VALUE]: string;
    [WindowChannel.SET_EDITOR_LOG_MODE]: boolean;
  };

  type WindowChannelAtomMap = {
    [key in keyof WindowChannelMap]: (data: WindowChannelMap[key]) => void;
  };

  const windowMessageMap: WindowChannelAtomMap = {
    [WindowChannel.SET_LAST_LOG_LINE]: setLastLogLine,
    [WindowChannel.SET_LOG_VALUE]: setLogValue,
    [WindowChannel.SET_EDITOR_LOG_MODE]: setEditorLogMode,
  };

  const messageMap: Partial<ChannelAtomMap> = {
    // [Channel.RESET_PROMPT]: resetPromptHandler,
    [Channel.APP_CONFIG]: setAppConfig,
    [Channel.EXIT]: setExit,
    [Channel.SET_PID]: setPid,
    [Channel.SET_SCRIPT]: setScript,
    [Channel.SET_SCRIPT_HISTORY]: setScriptHistory,
    [Channel.SET_UNFILTERED_CHOICES]: setUnfilteredChoices,
    [Channel.SET_DESCRIPTION]: setDescription,
    [Channel.SET_EDITOR_CONFIG]: setEditorConfig,
    [Channel.SET_EDITOR_SUGGESTIONS]: setEditorSuggestions,
    [Channel.APPEND_EDITOR_VALUE]: setEditorAppendValue,
    [Channel.SET_TEXTAREA_CONFIG]: setTextareaConfig,
    [Channel.SET_FLAGS]: setFlags,
    [Channel.SET_FOCUSED]: setFocused,
    [Channel.SET_HINT]: (html) => setHint(DOMPurify.sanitize(html)),
    [Channel.SET_PANEL]: setPanelHTML,
    [Channel.SET_PREVIEW]: setPreviewHTML,
    [Channel.SET_FOOTER]: (html) => setFooter(DOMPurify.sanitize(html)),
    [Channel.SET_FILTER_INPUT]: setFilterInput,
    [Channel.SET_INPUT]: setInput,
    [Channel.SET_LOADING]: setLoading,
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
    [Channel.START]: start,
    [Channel.GET_EDITOR_HISTORY]: getEditorHistory,
    [Channel.TERMINAL]: setSocketURL,
    [Channel.CLEAR_TABS]: () => setTabs([]),
    [Channel.ADD_CHOICE]: addChoice,
    [Channel.SET_APPEARANCE]: setAppearance,
    [Channel.SET_BOUNDS]: setBounds,
    [Channel.SET_RESIZING]: setResizing,
    [Channel.PLAY_AUDIO]: setAudio,
    [Channel.STOP_AUDIO]: () => setAudio(null),
    [Channel.SPEAK_TEXT]: setSpeak,
    [Channel.SET_SHORTCUTS]: setShortcuts,

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
  };

  const messageMapRef = useRef(messageMap);

  useEffect(() => {
    Object.entries(messageMap).forEach(([key, fn]) => {
      const listenerCount = ipcRenderer.listenerCount(key);
      console.log(`WINDOW LISTENER COUNT: ${key}`, listenerCount);
      if (listenerCount > 0) {
        ipcRenderer.removeAllListeners(key);
      }
      ipcRenderer.on(key, (_, data) => {
        console.log(`MESSAGE: ${key}`, data);
        // if (data?.kitScript) setScriptName(data?.kitScript);
        (fn as (data: ChannelMap[keyof ChannelAtomMap]) => void)(data);
      });
      // }
    });

    const kitStateCallback = (_: any, data: any) => {
      setKitState(data);
    };

    if (ipcRenderer.listenerCount(AppChannel.KIT_STATE) > 0) {
      ipcRenderer.removeAllListeners(AppChannel.KIT_STATE);
    }
    ipcRenderer.on(AppChannel.KIT_STATE, kitStateCallback);
  }, []);

  const windowsMessageMapRef = useRef(windowMessageMap);
  useEffect(() => {
    Object.entries(windowsMessageMapRef.current).forEach(([key, fn]) => {
      const listenerCount = ipcRenderer.listenerCount(key);
      console.log(`WINDOW LISTENER COUNT: ${key}`, listenerCount);
      if (listenerCount > 0) {
        ipcRenderer.removeAllListeners(key);
      }
      // if (ipcRenderer.listenerCount(key) === 0) {
      ipcRenderer.on(key, (_, data) => {
        // if (data?.kitScript) setScriptName(data?.kitScript);
        (fn as (data: WindowChannelMap[keyof WindowChannelAtomMap]) => void)(
          data
        );
      });
      // }
    });
  }, [windowsMessageMapRef.current]);

  useEffect(() => {
    ipcRenderer.on(AppChannel.PROCESSES, (_, data) => {
      setProcesses(data);
    });

    ipcRenderer.on(AppChannel.USER_CHANGED, (_, data) => {
      setUser(data);
    });
  }, [setProcesses, setUser]);

  return null;
});

export default Bridge;
