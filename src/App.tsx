/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable no-bitwise */
/* eslint-disable react/no-danger */
/* eslint-disable react/jsx-props-no-spreading */
/* eslint-disable no-restricted-syntax */
/* eslint-disable guard-for-in */
/* eslint-disable jsx-a11y/click-events-have-key-events */
/* eslint-disable jsx-a11y/no-static-element-interactions */
/* eslint-disable react/no-array-index-key */
/* eslint-disable react/prop-types */
/* eslint-disable no-nested-ternary */
/* eslint-disable @typescript-eslint/no-shadow */
/* eslint-disable jsx-a11y/no-autofocus */
/* eslint-disable jsx-a11y/label-has-associated-control */
import React, {
  ErrorInfo,
  RefObject,
  useCallback,
  useEffect,
  useRef,
} from 'react';
import { gsap } from 'gsap';
import { ToastContainer, toast, cssTransition } from 'react-toastify';
import { debounce } from 'lodash';
import path from 'path';
import { loader } from '@monaco-editor/react';
import DOMPurify from 'dompurify';

import { useAtom, useSetAtom, useAtomValue } from 'jotai';
import AutoSizer from 'react-virtualized-auto-sizer';
import {
  PanelGroup,
  Panel as PanelChild,
  PanelResizeHandle,
  ImperativePanelHandle,
} from 'react-resizable-panels';
import useResizeObserver from '@react-hook/resize-observer';
import { ipcRenderer, webFrame } from 'electron';
import { Channel, UI } from '@johnlindquist/kit/cjs/enum';
import { ChannelMap, KeyData } from '@johnlindquist/kit/types/kitapp';
import Tabs from './components/tabs';
import List from './components/list';
import Input from './components/input';
import ActionBar from './components/actionbar';
import Drop from './components/drop';
import Editor from './components/editor';
import Hotkey from './components/hotkey';
import Hint from './components/hint';
import Selected from './components/selected';
import TextArea from './components/textarea';
import Panel from './components/panel';
import Console from './components/console';
import Log from './components/log';
import Header from './components/header';
import Form from './components/form';
import {
  editorConfigAtom,
  editorSuggestionsAtom,
  flagsAtom,
  hintAtom,
  inputAtom,
  isMouseDownAtom,
  logHTMLAtom,
  mainHeightAtom,
  mouseEnabledAtom,
  openAtom,
  panelHTMLAtom,
  pidAtom,
  placeholderAtom,
  previewHTMLAtom,
  promptDataAtom,
  scriptAtom,
  submitValueAtom,
  submittedAtom,
  tabIndexAtom,
  tabsAtom,
  textareaConfigAtom,
  tempThemeAtom,
  topHeightAtom,
  uiAtom,
  choicesConfigAtom,
  topRefAtom,
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
  filterInputAtom,
  blurAtom,
  startAtom,
  logoAtom,
  getEditorHistoryAtom,
  scoredChoicesAtom,
  showTabsAtom,
  showSelectedAtom,
  processesAtom,
  setFocusedChoiceAtom,
  footerAtom,
  onPasteAtom,
  onDropAtom,
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
  appDbAtom,
  colorAtom,
  chatMessagesAtom,
  addChatMessageAtom,
  chatPushTokenAtom,
  setChatMessageAtom,
  termConfigAtom,
  zoomAtom,
  hasBorderAtom,
  channelAtom,
  termExitAtom,
  appendInputAtom,
  micIdAtom,
  webcamIdAtom,
  logAtom,
  logVisibleAtom,
  runningAtom,
  domUpdatedAtom,
  headerHiddenAtom,
  footerHiddenAtom,
  micConfigAtom,
  itemHeightAtom,
  inputHeightAtom,
  previewEnabledAtom,
  hasPreviewAtom,
  appBoundsAtom,
  indexAtom,
  promptBoundsAtom,
  audioDotAtom,
  scrollToIndexAtom,
  shortCodesAtom,
  scoredFlagsAtom,
  flagValueAtom,
} from './jotai';

import { useEnter, useEscape, useShortcuts, useThemeDetector } from './hooks';
import Splash from './components/splash';
import Emoji from './components/emoji';
import { AppChannel, WindowChannel } from './enums';
import Terminal from './term';
import Inspector from './components/inspector';
import { Chat } from './components/chat';
import AudioRecorder from './audio-recorder';
import Webcam from './webcam';
import Preview from './components/preview';
import FlagsList from './components/flags';

function ensureFirstBackSlash(str: string) {
  return str.length > 0 && str.charAt(0) !== '/' ? `/${str}` : str;
}

function uriFromPath(_path: string) {
  const pathName = path.resolve(_path).replace(/\\/g, '/');
  return encodeURI(`file://${ensureFirstBackSlash(pathName)}`);
}

const vs = uriFromPath(path.join(__dirname, '../assets/vs'));

loader.config({
  paths: {
    vs,
  },
});

class ErrorBoundary extends React.Component {
  // eslint-disable-next-line react/state-in-constructor
  public state: { hasError: boolean; info: ErrorInfo } = {
    hasError: false,
    info: { componentStack: '' },
  };

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Display fallback UI
    this.setState({ hasError: true, info });
    // You can also log the error to an error reporting service
    ipcRenderer.send(Channel.PROMPT_ERROR, { error });
  }

  render() {
    const { hasError, info } = this.state;
    const { children } = this.props;
    if (hasError) {
      return (
        <div className="p-2 font-mono">
          {/* Add a button to reload the window */}
          <button
            type="button"
            className="rounded bg-red-500 p-2 text-white"
            onClick={() => {
              ipcRenderer.send(AppChannel.RELOAD);
            }}
          >
            Reload Prompt
          </button>

          <div className="text-base text-red-500">
            Rendering Error. Opening logs.
          </div>
          <div className="text-xs">{info.componentStack}</div>
        </div>
      );
    }

    return children;
  }
}

export default function App() {
  const [pid, setPid] = useAtom(pidAtom);
  const [appConfig, setAppConfig] = useAtom(appConfigAtom);
  const [appDb, setAppDb] = useAtom(appDbAtom);
  const [open, setOpen] = useAtom(openAtom);
  const [script, setScript] = useAtom(scriptAtom);
  const [hint, setHint] = useAtom(hintAtom);
  const [panelHTML, setPanelHTML] = useAtom(panelHTMLAtom);
  const [logHtml, setLogHtml] = useAtom(logHTMLAtom);
  const [hidden, setHidden] = useAtom(isHiddenAtom);
  const [chatMessages, setChatMessages] = useAtom(chatMessagesAtom);
  const addChatMessage = useSetAtom(addChatMessageAtom);
  const chatPushToken = useSetAtom(chatPushTokenAtom);
  const setChatMessage = useSetAtom(setChatMessageAtom);
  const setPromptBounds = useSetAtom(promptBoundsAtom);

  const [ui, setUi] = useAtom(uiAtom);
  const choices = useAtomValue(scoredChoicesAtom);
  const showSelected = useAtomValue(showSelectedAtom);
  const showTabs = useAtomValue(showTabsAtom);
  const getEditorHistory = useAtomValue(getEditorHistoryAtom);
  const getColor = useAtomValue(colorAtom);
  const onPaste = useAtomValue(onPasteAtom);
  const onDrop = useAtomValue(onDropAtom);
  const logVisible = useAtomValue(logVisibleAtom);
  const submitted = useAtomValue(submittedAtom);

  const setExit = useSetAtom(exitAtom);
  const setScriptHistory = useSetAtom(_history);
  const [input, setInput] = useAtom(inputAtom);
  const appendInput = useSetAtom(appendInputAtom);
  const setPlaceholder = useSetAtom(placeholderAtom);
  const [promptData, setPromptData] = useAtom(promptDataAtom);
  const [theme, setTheme] = useAtom(themeAtom);
  const [tempTheme, setTempTheme] = useAtom(tempThemeAtom);
  const setSplashBody = useSetAtom(splashBodyAtom);
  const setSplashHeader = useSetAtom(splashHeaderAtom);
  const setSplashProgress = useSetAtom(splashProgressAtom);
  const setChoicesConfig = useSetAtom(choicesConfigAtom);
  const setScoredChoices = useSetAtom(scoredChoicesAtom);
  const setScoredFlags = useSetAtom(scoredFlagsAtom);
  const setFooter = useSetAtom(footerAtom);
  const setEnter = useSetAtom(enterAtom);
  const setReady = useSetAtom(isReadyAtom);
  const setTabIndex = useSetAtom(tabIndexAtom);
  const setTabs = useSetAtom(tabsAtom);
  const addChoice = useSetAtom(addChoiceAtom);
  const [previewHTML, setPreviewHTML] = useAtom(previewHTMLAtom);
  const setEditorConfig = useSetAtom(editorConfigAtom);
  const setEditorSuggestions = useSetAtom(editorSuggestionsAtom);
  const setEditorAppendValue = useSetAtom(editorAppendAtom);
  const setTextareaConfig = useSetAtom(textareaConfigAtom);
  const setFlags = useSetAtom(flagsAtom);
  const setMainHeight = useSetAtom(mainHeightAtom);
  const setTopHeight = useSetAtom(topHeightAtom);
  const setSubmitValue = useSetAtom(submitValueAtom);
  const setMouseEnabled = useSetAtom(mouseEnabledAtom);
  const setTopRef = useSetAtom(topRefAtom);
  const setDescription = useSetAtom(descriptionAtom);
  const setName = useSetAtom(nameAtom);
  const setTextareaValue = useSetAtom(textareaValueAtom);
  const setLoading = useSetAtom(loadingAtom);
  const setRunning = useSetAtom(runningAtom);
  const setValueInvalid = useSetAtom(valueInvalidAtom);
  const setFilterInput = useSetAtom(filterInputAtom);
  const setBlur = useSetAtom(blurAtom);
  const start = useSetAtom(startAtom);
  const setLogo = useSetAtom(logoAtom);
  const setProcesses = useSetAtom(processesAtom);
  const setUser = useSetAtom(userAtom);
  const setFocused = useSetAtom(setFocusedChoiceAtom);
  const setIsMouseDown = useSetAtom(isMouseDownAtom);
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
  const setShortcodes = useSetAtom(shortCodesAtom);
  const setFlagValue = useSetAtom(flagValueAtom);
  const [termConfig, setTermConfig] = useAtom(termConfigAtom);
  const setMicConfig = useSetAtom(micConfigAtom);
  const setTermExit = useSetAtom(termExitAtom);
  const [headerHidden, setHeaderHidden] = useAtom(headerHiddenAtom);
  const [footerHidden, setFooterHidden] = useAtom(footerHiddenAtom);
  const [inputHeight, setInputHeight] = useAtom(inputHeightAtom);
  const [itemHeight, setItemHeight] = useAtom(itemHeightAtom);
  const [previewEnabled] = useAtom(previewEnabledAtom);
  const [hasPreview] = useAtom(hasPreviewAtom);
  const scrollToIndex = useAtomValue(scrollToIndexAtom);

  const index = useAtomValue(indexAtom);

  const previewCheck = Boolean(
    !appDb.mini && previewHTML && previewEnabled && !hidden
  );

  const log = useAtomValue(logAtom);
  // log({
  //   previewCheck: previewCheck ? '✅' : '🚫',
  //   previewHTML: previewHTML?.length,
  //   panelHTML: panelHTML?.length,
  //   previewEnabled,
  //   hidden,
  // });

  const [zoomLevel, setZoom] = useAtom(zoomAtom);
  const setMicId = useSetAtom(micIdAtom);
  const setWebcamId = useSetAtom(webcamIdAtom);

  const hasBorder = useAtomValue(hasBorderAtom);

  const channel = useAtomValue(channelAtom);

  const domUpdated = useSetAtom(domUpdatedAtom);
  const setAppBounds = useSetAtom(appBoundsAtom);

  const setAudioDot = useSetAtom(audioDotAtom);

  useEffect(() => {
    // catch all window errors
    const errorHandler = async (event: ErrorEvent) => {
      const { message, filename, lineno, colno, error } = event;
      log({
        type: 'error',
        message,
        filename,
        lineno,
        colno,
        error,
      });

      ipcRenderer.send(AppChannel.ERROR_RELOAD, {
        message,
        filename,
        lineno,
        colno,
        error,
      });
    };

    window.addEventListener('error', errorHandler);

    return () => {
      window.removeEventListener('error', errorHandler);
    };
  }, []);

  useEffect(() => {
    const idsToWatch = [
      'log',
      'preview',
      UI.term,
      UI.chat,
      UI.editor,
      UI.drop,
      UI.textarea,
      UI.mic,
      UI.webcam,
      UI.form,
    ];
    const mutationCallback = (mutationsList: MutationRecord[]) => {
      for (const mutation of mutationsList) {
        if (mutation.type === 'childList') {
          for (const addedNode of Array.from(mutation.addedNodes)) {
            const addedElement = addedNode as Element;
            if (idsToWatch.includes(addedElement.id)) {
              domUpdated()(`${addedElement.id} added to DOM`);
            }
          }

          for (const removedNode of Array.from(mutation.removedNodes)) {
            const removedElement = removedNode as Element;
            if (removedElement.id === 'panel-simplebar') {
              domUpdated()(`${removedElement.id} removed from DOM`);
            }
          }
        }
      }
    };

    const observer = new MutationObserver(mutationCallback);
    const targetNode: HTMLElement | null = document.querySelector('body');
    if (targetNode) {
      const config = { childList: true, subtree: true };
      observer.observe(targetNode, config);
    }

    // Clean up when the component is unmounted or the effect dependencies change
    return () => {
      observer.disconnect();
    };
  }, []); // Add the dependency array to ensure the effect runs when the idsToWatch array changes

  useEffect(() => {
    const handleResize = debounce(() => {
      const zl = webFrame.getZoomLevel();
      setZoom(zl);
    }, 250);

    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, [setZoom]);

  useShortcuts();
  useEnter();
  useThemeDetector();

  const appRef: RefObject<HTMLDivElement> = useRef(null);
  const windowContainerRef: RefObject<HTMLDivElement> = useRef(null);
  const headerRef: RefObject<HTMLDivElement> = useRef(null);

  useResizeObserver(headerRef, (entry) => {
    setTopHeight(entry.contentRect.height);
  });

  useResizeObserver(appRef, (entry) => {
    setAppBounds({
      width: entry.contentRect.width,
      height: entry.contentRect.height,
    });
  });

  type ChannelAtomMap = {
    [key in keyof ChannelMap]: (data: ChannelMap[key]) => void;
  };

  type ToastData = {
    text: Parameters<typeof toast>[0];
    options?: Parameters<typeof toast>[1];
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const messageMap: ChannelAtomMap = {
    // [Channel.RESET_PROMPT]: resetPromptHandler,
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
    [Channel.SET_FILTER_INPUT]: setFilterInput,
    [Channel.SET_INPUT]: setInput,
    [Channel.GET_INPUT]: () => {
      channel(Channel.GET_INPUT, { value: input });
    },
    [Channel.APPEND_INPUT]: appendInput,
    [Channel.SET_LOADING]: setLoading,
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
    [Channel.START]: start,
    [Channel.GET_EDITOR_HISTORY]: getEditorHistory,
    [Channel.GET_COLOR]: () => getColor(),
    [Channel.CLEAR_TABS]: setTabs,
    [Channel.ADD_CHOICE]: addChoice,
    [Channel.SET_BOUNDS]: setBounds,
    [Channel.SET_RESIZING]: setResizing,
    [Channel.PLAY_AUDIO]: setAudio,
    [Channel.STOP_AUDIO]: () => setAudio(null),
    [Channel.SPEAK_TEXT]: setSpeak,
    [Channel.SET_SHORTCUTS]: setShortcuts,
    [Channel.SET_SHORTCODES]: setShortcodes,
    [Channel.CHAT_SET_MESSAGES]: setChatMessages,
    [Channel.CHAT_ADD_MESSAGE]: addChatMessage,
    [Channel.CHAT_PUSH_TOKEN]: chatPushToken,
    [Channel.CHAT_SET_MESSAGE]: setChatMessage,
    [Channel.START_MIC]: () => {
      setAudioDot(true);
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
          log({
            key,
            value,
          });
        }
      });
    },

    [WindowChannel.SET_LAST_LOG_LINE]: setLastLogLine,
    [WindowChannel.SET_LOG_VALUE]: setLogValue,
    [WindowChannel.SET_EDITOR_LOG_MODE]: setEditorLogMode,
  };

  const ipcGet = useCallback(
    (channel: string, value: any) => {
      const handler = async () => {
        ipcRenderer.send(channel, {
          channel,
          pid: pid || 0,
          value,
        });
      };
      ipcRenderer.on(channel, handler);

      return () => {
        ipcRenderer.off(channel, handler);
      };
    },
    [pid]
  );

  useEffect(() => {
    const removeChatMessages = ipcGet(Channel.CHAT_GET_MESSAGES, chatMessages);

    return () => {
      removeChatMessages();
    };
  }, [chatMessages, ipcGet]);

  useEffect(() => {
    Object.entries(messageMap).forEach(([key, fn]) => {
      if (ipcRenderer.listenerCount(key) === 0) {
        ipcRenderer.on(key, (_, data) => {
          // if (data?.kitScript) setScriptName(data?.kitScript);
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
      console.log(`Setting:`, data?.name, data?.value);
      document.documentElement.style.setProperty(data?.name, data?.value);
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
      // ipcRenderer.off(AppChannel.SET_BOUNDS, handleSetBounds);
    };
  }, [messageMap]);

  useEffect(() => {
    const processesHandler = (_, data) => {
      setProcesses(data);
    };
    ipcRenderer.on(AppChannel.PROCESSES, processesHandler);

    const userChangedHandler = (_, data) => {
      setUser(data);
    };
    ipcRenderer.on(AppChannel.USER_CHANGED, userChangedHandler);

    return () => {
      ipcRenderer.removeListener(AppChannel.PROCESSES, processesHandler);
      ipcRenderer.removeListener(AppChannel.USER_CHANGED, userChangedHandler);
    };
  }, [setProcesses, setUser]);

  const onMouseDown = useCallback(() => {
    setIsMouseDown(true);
  }, [setIsMouseDown]);
  const onMouseUp = useCallback(() => {
    setIsMouseDown(false);
  }, [setIsMouseDown]);
  const onMouseLeave = useCallback(() => {
    setIsMouseDown(false);
  }, [setIsMouseDown]);

  const onMouseMove = useCallback(() => {
    setMouseEnabled(1);
  }, [setMouseEnabled]);

  useEffect(() => {
    if (headerRef?.current) setTopRef(headerRef?.current);
  }, [headerRef, setTopRef]);

  useEffect(() => {
    document.addEventListener('paste', onPaste);

    return () => {
      document.removeEventListener('paste', onPaste);
    };
  }, [onPaste]);

  useEscape();

  const panelChildRef = useRef<ImperativePanelHandle>(null);

  useEffect(() => {
    if (promptData?.previewWidthPercent && panelChildRef.current) {
      const needsAnimation =
        document.getElementById('#data-panel-id-panelChild')?.style.flexGrow ===
        0;
      if (needsAnimation) {
        gsap.to(
          '#data-panel-id-panelChild',

          {
            // 'flex-grow': 0,
            alpha: 1,
            // ease: Power0.easeOut,
            duration: 0.15,
            'flex-grow': promptData?.previewWidthPercent,
            onComplete: () => {
              // set data-panel-size to promptData?.previewWidthPercent
              panelChildRef.current?.resize(panelChildRef.current?.getSize());
              const panelResizeElement = document.querySelector(
                '[data-panel-resize-handle-id="panelResizeHandle"]'
              );
              if (panelResizeElement) {
                panelResizeElement!.tabIndex = -1;
              }
            },
          }
        );
      }
    }
  }, [panelChildRef.current, previewHTML]);

  const onResizeHandleDragging = useCallback(
    debounce((event: MouseEvent) => {
      const size = panelChildRef.current?.getSize();
      // if size is within 10 of promptData?.previewWidthPercent, then set it to promptData?.previewWidthPercent
      if (
        size &&
        promptData?.previewWidthPercent &&
        Math.abs(size - promptData?.previewWidthPercent) < 10
      ) {
        panelChildRef.current?.resize(promptData?.previewWidthPercent);
      }
    }, 250),
    [promptData?.previewWidthPercent, panelChildRef?.current]
  );

  return (
    <ErrorBoundary>
      <div
        id="main-container"
        ref={appRef}
        className={`
min-w-screen h-screen
min-h-screen w-screen
text-text-base
${hasBorder ? `border-1 border-ui-border` : ``}
${appConfig.isMac && hasBorder ? `main-rounded` : ``}
      `}
      >
        {/* {lighten && (
          <style
            dangerouslySetInnerHTML={{
              __html: `
*[class*='bg-secondary'] {
  background-color: rgba(255, 255, 255, 0.07);
}

*[class*='border-secondary'] {
  border-color: rgba(255, 255, 255, 0.15);
}

.prose thead, tr, h1:first-of-type {
  border-color: rgba(255, 255, 255, 0.4) !important;
}
  `,
            }}
          />
        )} */}
        <div
          onDrop={(event) => {
            if (ui !== UI.drop) {
              channel(Channel.ON_DROP);
            }
            // console.log(`🎉 drop`)n;
            onDrop(event);
          }}
          onDragEnter={() => {
            channel(Channel.ON_DRAG_ENTER);
            // console.log(`drag enter`);
          }}
          onDragOver={(event) => {
            channel(Channel.ON_DRAG_OVER);
            event.stopPropagation();
            event.preventDefault();
          }}
          onDragLeave={() => {
            channel(Channel.ON_DRAG_LEAVE);
            // console.log(`drag leave`);
          }}
          ref={windowContainerRef}
          style={
            {
              WebkitUserSelect: 'none',
            } as any
          }
          className={`
        ${hidden && appConfig.isMac ? 'hidden' : ''}
        flex h-full
        w-full flex-col
        `}
          onMouseDown={onMouseDown}
          onMouseUp={onMouseUp}
          onMouseLeave={onMouseLeave}
          onMouseMove={onMouseMove}
        >
          {ui !== UI.log && (
            <header id="header" ref={headerRef} className="relative z-10">
              {headerHidden === false && <Header />}

              {ui === UI.hotkey && (
                <Hotkey
                  key="AppHotkey"
                  submit={setSubmitValue}
                  onHotkeyHeightChanged={setMainHeight}
                />
              )}

              {ui === UI.arg && (
                <ErrorBoundary>
                  <Input key="AppInput" />
                </ErrorBoundary>
              )}

              {hint && <Hint key="AppHint" />}

              {(showTabs || showSelected) && (
                <div>
                  {showTabs && !showSelected && <Tabs key="AppTabs" />}
                  {showSelected && <Selected key="AppSelected" />}
                </div>
              )}
            </header>
          )}
          {logVisible && <Console key="AppLog" />}
          <main id="main" className="min-h-1 w-full flex-1 overflow-y-hidden">
            <PanelGroup
              direction="horizontal"
              autoSaveId={script.filePath}
              className={`flex h-full w-full flex-row
${showTabs || showSelected ? 'border-t border-ui-border' : ''}

            `}
            >
              <PanelChild minSize={25}>
                <div className="h-full">
                  <ToastContainer
                    pauseOnFocusLoss={false}
                    position="bottom-center"
                    transition={cssTransition({
                      // don't fade in/out
                      enter: 'animate__animated animate__slideInUp',
                      exit: 'animate__animated animate__slideOutDown',
                      collapseDuration: 0,
                      collapse: true,
                    })}
                  />

                  {ui === UI.splash && <Splash />}
                  {ui === UI.drop && <Drop />}
                  {ui === UI.textarea && <TextArea />}
                  {ui === UI.editor && <Editor />}
                  {ui === UI.log && <Log />}
                  {ui === UI.emoji && <Emoji />}
                  {ui === UI.debugger && <Inspector />}
                  {ui === UI.chat && <Chat />}
                  {/* TODO: These UI setup logic "onMount", so open is here in case they were the ui on previous close, then immediately re-opened */}

                  {ui === UI.term &&
                    open &&
                    termConfig?.promptId === promptData?.id && <Terminal />}
                  {ui === UI.mic && open && <AudioRecorder />}
                  {ui === UI.webcam && open && <Webcam />}

                  {((ui === UI.arg && !panelHTML && choices.length > 0) ||
                    ui === UI.hotkey) && (
                    <AutoSizer>
                      {({ width, height }) =>
                        ((ui === UI.arg && !panelHTML && choices.length > 0) ||
                          ui === UI.hotkey) && (
                          <List height={height} width={width} />
                        )
                      }
                    </AutoSizer>
                  )}
                  {(!!(ui === UI.arg || ui === UI.div) &&
                    panelHTML.length > 0 && <Panel />) ||
                    (ui === UI.form && (
                      <>
                        <Form />
                      </>
                    ))}
                </div>
              </PanelChild>

              {/* {previewEnabled && <Preview />} */}

              {(previewCheck || showSelected) && (
                <>
                  <PanelResizeHandle
                    id="panelResizeHandle"
                    className="w-0.5 border-l-1 border-ui-border hover:-ml-0.5 hover:w-3 hover:border-r-1 hover:border-white/10 hover:bg-white/5"
                    onDragging={onResizeHandleDragging}
                  />
                  <PanelChild
                    id="panelChild"
                    collapsible
                    ref={panelChildRef}
                    // style={{
                    //   flexGrow: 0,
                    // }}
                  >
                    {showSelected ? (
                      <AutoSizer>
                        {({ width, height }) => (
                          <FlagsList height={height} width={width} />
                        )}
                      </AutoSizer>
                    ) : (
                      <Preview />
                    )}
                  </PanelChild>
                </>
              )}
            </PanelGroup>
          </main>
          {!footerHidden && (
            <footer
              id="footer"
              className={`${promptData?.footerClassName || ''} z-50`}
            >
              <ActionBar />
            </footer>
          )}
        </div>
      </div>

      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <audio id="audio" />
    </ErrorBoundary>
  );
}
