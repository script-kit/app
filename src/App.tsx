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
import { ToastContainer, toast, cssTransition } from 'react-toastify';

import path from 'path';
import { loader } from '@monaco-editor/react';
import DOMPurify from 'dompurify';

import { useAtom, useSetAtom, useAtomValue } from 'jotai';
import AutoSizer from 'react-virtualized-auto-sizer';
import useResizeObserver from '@react-hook/resize-observer';
import { ipcRenderer, webFrame } from 'electron';
import { AnimatePresence, motion, useAnimation } from 'framer-motion';

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
  tabIndexAtom,
  tabsAtom,
  textareaConfigAtom,
  tempThemeAtom,
  topHeightAtom,
  uiAtom,
  unfilteredChoicesAtom,
  topRefAtom,
  _description,
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
  scoredChoices,
  showTabsAtom,
  showSelectedAtom,
  nullChoicesAtom,
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
  infoChoicesAtom,
  appendChoicesAtom,
  termConfigAtom,
  zoomAtom,
  hasBorderAtom,
} from './jotai';

import { useEnter, useEscape, useShortcuts, useThemeDetector } from './hooks';
import Splash from './components/splash';
import Emoji from './components/emoji';
import { AppChannel, WindowChannel } from './enums';
import Terminal from './term';
import Inspector from './components/inspector';
import { Chat } from './components/chat';
import InfoList from './components/info';

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

  const ui = useAtomValue(uiAtom);
  const choices = useAtomValue(scoredChoices);
  const showSelected = useAtomValue(showSelectedAtom);
  const showTabs = useAtomValue(showTabsAtom);
  const nullChoices = useAtomValue(nullChoicesAtom);
  const infoChoices = useAtomValue(infoChoicesAtom);
  const getEditorHistory = useAtomValue(getEditorHistoryAtom);
  const getColor = useAtomValue(colorAtom);
  const onPaste = useAtomValue(onPasteAtom);
  const onDrop = useAtomValue(onDropAtom);

  const setExit = useSetAtom(exitAtom);
  const setScriptHistory = useSetAtom(_history);
  const setInput = useSetAtom(inputAtom);
  const setPlaceholder = useSetAtom(placeholderAtom);
  const setPromptData = useSetAtom(promptDataAtom);
  const setTheme = useSetAtom(themeAtom);
  const setTempTheme = useSetAtom(tempThemeAtom);
  const setSplashBody = useSetAtom(splashBodyAtom);
  const setSplashHeader = useSetAtom(splashHeaderAtom);
  const setSplashProgress = useSetAtom(splashProgressAtom);
  const setUnfilteredChoices = useSetAtom(unfilteredChoicesAtom);
  const appendChoices = useSetAtom(appendChoicesAtom);
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
  const setMainHeight = useSetAtom(mainHeightAtom);
  const setTopHeight = useSetAtom(topHeightAtom);
  const setSubmitValue = useSetAtom(submitValueAtom);
  const setMouseEnabled = useSetAtom(mouseEnabledAtom);
  const setTopRef = useSetAtom(topRefAtom);
  const setDescription = useSetAtom(_description);
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
  const setTermConfig = useSetAtom(termConfigAtom);

  const [zoomLevel, setZoom] = useAtom(zoomAtom);
  const hasBorder = useAtomValue(hasBorderAtom);

  useEffect(() => {
    const handleResize = () => {
      const zl = webFrame.getZoomLevel();
      setZoom(zl);

      // set a --zoom-level css variable for use in css
      document.documentElement.style.setProperty('--zoom-level', `${zl}`);
    };

    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, [setZoom]);

  useShortcuts();
  useEnter();
  useThemeDetector();
  const controls = useAnimation();

  const mainRef: RefObject<HTMLDivElement> = useRef(null);
  const windowContainerRef: RefObject<HTMLDivElement> = useRef(null);
  const headerRef: RefObject<HTMLDivElement> = useRef(null);

  useResizeObserver(headerRef, (entry) => {
    setTopHeight(entry.contentRect.height);
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
    [Channel.SET_SCRIPT]: setScript,
    [Channel.SET_SCRIPT_HISTORY]: setScriptHistory,
    [Channel.SET_UNFILTERED_CHOICES]: setUnfilteredChoices,
    [Channel.APPEND_CHOICES]: appendChoices,
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
    [Channel.GET_COLOR]: () => getColor(),
    [Channel.CLEAR_TABS]: setTabs,
    [Channel.ADD_CHOICE]: addChoice,
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
    [Channel.TOAST]: ({ text, options }: ToastData) => {
      toast(text, options);
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

    ipcRenderer.on(AppChannel.KIT_STATE, kitStateCallback);

    const handleTermConfig: (
      event: Electron.IpcRendererEvent,
      ...args: any[]
    ) => void = (_, data) => {
      setTermConfig(data);
    };
    ipcRenderer.on(AppChannel.SET_TERM_CONFIG, handleTermConfig);

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
    ipcRenderer.on(AppChannel.CSS_VARIABLE, handleCSSVariable);

    const handleZoom = (_, data) => {
      setZoom(data);
    };

    ipcRenderer.on(AppChannel.ZOOM, handleZoom);

    return () => {
      Object.entries(messageMap).forEach(([key, fn]) => {
        ipcRenderer.off(key, fn);
      });

      ipcRenderer.off(AppChannel.KIT_STATE, kitStateCallback);
      ipcRenderer.off(AppChannel.CSS_VARIABLE, handleCSSVariable);
      ipcRenderer.off(AppChannel.SET_TERM_CONFIG, handleTermConfig);
      ipcRenderer.off(AppChannel.ZOOM, handleZoom);
    };
  }, [messageMap]);

  useEffect(() => {
    ipcRenderer.on(AppChannel.PROCESSES, (_, data) => {
      setProcesses(data);
    });

    ipcRenderer.on(AppChannel.USER_CHANGED, (_, data) => {
      setUser(data);
    });
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

  // TODO: Can I remove this?
  useEffect(() => {
    if (open) {
      controls.start({ opacity: [1, 1] });
    } else {
      controls.stop();
      controls.set({ opacity: 1 });
    }
  }, [open, controls]);

  const showIfOpen = useCallback(() => {
    if (open) setHidden(false);
  }, [open, setHidden]);

  const hideIfClosed = useCallback(() => {
    if (!open) setHidden(true);
  }, [open, setHidden]);

  useEscape();

  return (
    <ErrorBoundary>
      <div
        className={`
        w-screen h-screen
        min-w-screen min-h-screen


      bg-bg-base
      text-text-base

      transition-colors duration-200
      bg-opacity-base

      ${hasBorder ? `main-container` : ``}
      ${appConfig.isMac && hasBorder ? `main-rounded` : ``}

      `}
      >
        {/* {JSON.stringify(state)} */}
        <AnimatePresence key="appComponents">
          <motion.div
            animate={controls}
            // TODO: Maybe remove animation when not main menu?
            transition={{ duration: 0.12 }}
            onAnimationStart={showIfOpen}
            onAnimationComplete={hideIfClosed}
            ref={windowContainerRef}
            style={
              {
                WebkitUserSelect: 'none',
              } as any
            }
            className={`
        ${hidden && appConfig.isMac ? 'hidden' : ''}
        flex flex-col
        w-full h-full
        `}
            onMouseDown={onMouseDown}
            onMouseUp={onMouseUp}
            onMouseLeave={onMouseLeave}
            onMouseMove={onMouseMove}
          >
            {ui !== UI.log && (
              <header ref={headerRef} className="relative z-10">
                <Header />

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
                  <div className="max-h-5.5">
                    {showTabs && <Tabs key="AppTabs" />}
                    {showSelected && <Selected key="AppSelected" />}
                  </div>
                )}
              </header>
            )}
            <main
              ref={mainRef}
              className="flex-1 min-h-1 overflow-y-hidden w-full"
              onPaste={onPaste}
              onDrop={(event) => {
                console.log(`🎉 drop`);
                onDrop(event);
              }}
              onDragEnter={() => {
                console.log(`drag enter`);
              }}
              onDragOver={(event) => {
                event.stopPropagation();
                event.preventDefault();
              }}
            >
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
              <AnimatePresence key="mainComponents">
                {ui === UI.splash && <Splash />}
                {ui === UI.drop && <Drop />}
                {ui === UI.textarea && <TextArea />}
                {ui === UI.editor && <Editor />}
                {ui === UI.log && <Log />}
                {ui === UI.term && <Terminal />}
                {ui === UI.emoji && <Emoji />}
                {ui === UI.debugger && <Inspector />}
                {ui === UI.chat && <Chat />}
              </AnimatePresence>
              <AutoSizer>
                {({ width, height }) => (
                  <>
                    {infoChoices?.length > 0 && (
                      <InfoList width={width} height={height} />
                    )}
                    {(ui === UI.arg && !nullChoices && choices.length > 0 && (
                      <>
                        <List height={height} width={width} />
                      </>
                    )) ||
                      (!!(ui === UI.arg || ui === UI.hotkey || ui === UI.div) &&
                        panelHTML.length > 0 && (
                          <>
                            <Panel width={width} height={height} />
                          </>
                        )) ||
                      (ui === UI.form && (
                        <>
                          <Form width={width} height={height} />
                        </>
                      ))}
                  </>
                )}
              </AutoSizer>
            </main>
            {logHtml?.length > 0 && script?.log !== 'false' && (
              <Console key="AppLog" />
            )}
            <ActionBar />
          </motion.div>
        </AnimatePresence>
      </div>
      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <audio id="audio" />
    </ErrorBoundary>
  );
}
