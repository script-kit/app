import React, {
  ErrorInfo,
  RefObject,
  useCallback,
  useEffect,
  useRef,
} from 'react';
import log from 'electron-log/renderer';
import { ToastContainer, cssTransition } from 'react-toastify';
import { debounce } from 'lodash-es';

import { useAtom, useSetAtom, useAtomValue } from 'jotai';
import AutoSizer from 'react-virtualized-auto-sizer';
import {
  PanelGroup,
  Panel as PanelChild,
  PanelResizeHandle,
  ImperativePanelHandle,
} from 'react-resizable-panels';
import useResizeObserver from '@react-hook/resize-observer';
const { ipcRenderer, webFrame } = window.electron;
import { Channel, UI } from '@johnlindquist/kit/core/enum';
import Tabs from './components/tabs';
import List from './components/list';
import Input from './components/input';
import ActionBar from './components/actionbar';
import Drop from './components/drop';
import Editor from './components/editor';
import Hotkey from './components/hotkey';
import Hint from './components/hint';
import TextArea from './components/textarea';
import Panel from './components/panel';
import Console from './components/console';
import Log from './components/log';
import Header from './components/header';
import Form from './components/form';
import {
  hintAtom,
  isMouseDownAtom,
  mainHeightAtom,
  mouseEnabledAtom,
  openAtom,
  panelHTMLAtom,
  pidAtom,
  promptDataAtom,
  scriptAtom,
  submitValueAtom,
  uiAtom,
  topRefAtom,
  scoredChoicesAtom,
  showTabsAtom,
  processesAtom,
  onPasteAtom,
  onDropAtom,
  kitStateAtom,
  userAtom,
  chatMessagesAtom,
  termConfigAtom,
  zoomAtom,
  channelAtom,
  logVisibleAtom,
  domUpdatedAtom,
  headerHiddenAtom,
  footerHiddenAtom,
  appBoundsAtom,
  flaggedChoiceValueAtom,
  previewCheckAtom,
  loadingAtom,
  audioDotAtom,
  isMainScriptAtom,
  progressAtom,
  cssAtom,
  triggerResizeAtom,
  inputAtom,
  focusedElementAtom,
  submittedAtom,
  inputWhileSubmittedAtom,
  micIdAtom,
  micMediaRecorderAtom,
} from './jotai';

import { useEnter, useEscape, useMessages, useShortcuts } from './hooks';
import Splash from './components/splash';
import Emoji from './components/emoji';
import { AppChannel } from '../../shared/enums';
import Terminal from './term';
import Inspector from './components/inspector';
import { Chat } from './components/chat';
import AudioRecorder from './audio-recorder';
import Webcam from './webcam';
import Preview from './components/preview';
import ActionsList from './components/actions-list';
import AudioDot from './audio-dot';
import LoadingDot from './loading-dot';
import ProcessesDot from './processes-dot';
import ProgressBar from './progress-bar';
import * as monaco from 'monaco-editor';
import { loader } from '@monaco-editor/react';
loader.config({ monaco });

class ErrorBoundary extends React.Component {
  // eslint-disable-next-line react/state-in-constructor
  public state: { hasError: boolean; info: ErrorInfo } = {
    hasError: false,
    info: { componentStack: '' },
  };

  componentDidCatch(error: Error, info: ErrorInfo) {
    log.warn('ErrorBoundary:', error, info);
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
  const [pid] = useAtom(pidAtom);
  const [input] = useAtom(inputAtom);
  const [open] = useAtom(openAtom);
  const [script] = useAtom(scriptAtom);
  const [hint] = useAtom(hintAtom);
  const [panelHTML] = useAtom(panelHTMLAtom);
  const [chatMessages] = useAtom(chatMessagesAtom);

  const [ui] = useAtom(uiAtom);
  const loading = useAtomValue(loadingAtom);
  const progress = useAtomValue(progressAtom);
  const choices = useAtomValue(scoredChoicesAtom);
  const showTabs = useAtomValue(showTabsAtom);
  const onPaste = useAtomValue(onPasteAtom);
  const onDrop = useAtomValue(onDropAtom);
  const logVisible = useAtomValue(logVisibleAtom);

  const [promptData] = useAtom(promptDataAtom);

  const setMainHeight = useSetAtom(mainHeightAtom);
  const triggerResize = useSetAtom(triggerResizeAtom);
  const setSubmitValue = useSetAtom(submitValueAtom);
  const setMouseEnabled = useSetAtom(mouseEnabledAtom);
  const setTopRef = useSetAtom(topRefAtom);
  const setProcesses = useSetAtom(processesAtom);
  const setUser = useSetAtom(userAtom);
  const setIsMouseDown = useSetAtom(isMouseDownAtom);

  const [kitState] = useAtom(kitStateAtom);
  const [flagValue] = useAtom(flaggedChoiceValueAtom);
  const [termConfig] = useAtom(termConfigAtom);
  const [headerHidden] = useAtom(headerHiddenAtom);
  const [footerHidden] = useAtom(footerHiddenAtom);
  const processes = useAtomValue(processesAtom);
  const isMainScript = useAtomValue(isMainScriptAtom);
  const css = useAtomValue(cssAtom);
  const [submitted, setSubmitted] = useAtom(submittedAtom);
  const [inputWhileSubmitted, setInputWhileSubmitted] = useAtom(
    inputWhileSubmittedAtom,
  );

  const submittedInputRef = useRef<HTMLInputElement>(null);

  const previewCheck = useAtomValue(previewCheckAtom);
  const showRightPanel = previewCheck && !kitState.noPreview;
  // log({
  //   previewCheck: previewCheck ? '✅' : '🚫',
  //   previewHTML: previewHTML?.length,
  //   panelHTML: panelHTML?.length,
  //   previewEnabled,
  //   hidden,
  // });

  const [zoomLevel, setZoom] = useAtom(zoomAtom);

  const channel = useAtomValue(channelAtom);

  const domUpdated = useSetAtom(domUpdatedAtom);
  const setAppBounds = useSetAtom(appBoundsAtom);

  const audioDot = useAtomValue(audioDotAtom);

  const [focusedElement, setFocusedElement] = useAtom(focusedElementAtom);

  useMessages();

  const micId = useAtomValue(micIdAtom);
  const [micMediaRecorder, setMicMediaRecorder] = useAtom(micMediaRecorderAtom);

  // TODO: Can I have access to the mic "instantly"? I don't like the delay, but this makes it looks like it's always recording
  // useEffect(() => {
  //   log.info(`🎙 Mic ID changed...`, { micId });

  //   if (!micId) {
  //     return;
  //   }

  //   const constraints = {
  //     audio: micId ? { deviceId: micId } : true,
  //   };

  //   navigator.mediaDevices
  //     .getUserMedia(constraints)
  //     // eslint-disable-next-line promise/always-return
  //     .then((stream) => {
  //       log.info(`🎙 Connected to mic...`);
  //       const mediaRecorder = new MediaRecorder(stream);

  //       setMicMediaRecorder(mediaRecorder);
  //     })
  //     .catch((err) => {
  //       log.info(`Error connecting to mic... ${err}`);
  //     });
  // }, [micId]);

  useEffect(() => {
    const handleFocusIn = (event: FocusEvent) => {
      // id isn't "actions-input"
      const target = event.target as HTMLElement;
      const tag = target.tagName;
      if (
        target.id !== 'actions-input' &&
        (tag === 'INPUT' ||
          tag === 'TEXTAREA' ||
          tag === 'SELECT' ||
          target.isContentEditable)
      ) {
        log.info(`🔍 Focused element: ${target.id || target.nodeName}`);
        setFocusedElement(event.target as HTMLElement);
      }
    };

    document.addEventListener('focusin', handleFocusIn);

    return () => {
      document.removeEventListener('focusin', handleFocusIn);
    };
  }, []);

  useEffect(() => {
    log.info(`${pid}: 👩‍💻 UI changed to: ${ui}`);
  }, [ui, pid]);

  useEffect(() => {
    if (submitted) {
      submittedInputRef.current?.focus();
    }
  }, [submitted]);

  useEffect(() => {
    document.addEventListener('visibilitychange', () => {
      log.info(`${pid}: 👁️‍🗨️ visibilitychange: ${document.visibilityState}`);
    });
  }, [pid]);

  // useEffect(() => {
  //   (window as any)._resetPrompt = async () => {
  //     log.info(`Resetting prompt...`);
  //     return resetPrompt();
  //   };

  //   (window as any).log = log;
  // }, []);

  useEffect(() => {
    // catch all window errors
    const errorHandler = async (event: ErrorEvent) => {
      const { message, filename, lineno, colno, error } = event;
      log.info({
        type: 'error',
        message,
        filename,
        lineno,
        colno,
        error,
        pid,
        scriptPath: promptData?.scriptPath,
      });

      ipcRenderer.send(AppChannel.ERROR_RELOAD, {
        message,
        filename,
        lineno,
        colno,
        error,
        pid,
        scriptPath: promptData?.scriptPath,
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

  useEscape();
  useShortcuts();
  useEnter();
  // useThemeDetector();

  const appRef: RefObject<HTMLDivElement> = useRef(null);
  const windowContainerRef: RefObject<HTMLDivElement> = useRef(null);
  const headerRef: RefObject<HTMLDivElement> = useRef(null);

  useResizeObserver(headerRef, (entry) => {
    triggerResize(`headerRef: ${entry.contentRect.height}`);
  });

  useResizeObserver(appRef, (entry) => {
    setAppBounds({
      width: entry.contentRect.width,
      height: entry.contentRect.height,
    });
  });

  // eslint-disable-next-line react-hooks/exhaustive-deps

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
    [pid],
  );

  useEffect(() => {
    const removeChatMessages = ipcGet(Channel.CHAT_GET_MESSAGES, chatMessages);

    return () => {
      removeChatMessages();
    };
  }, [chatMessages, ipcGet]);

  useEffect(() => {
    const processesHandler = (_, data) => {
      setProcesses(data);
    };
    ipcRenderer.on(AppChannel.PROCESSES, processesHandler);

    const userChangedHandler = (_, data) => {
      // log.info(`${window.pid}: 👩‍💻 User changed`, data?.username);
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

  const panelChildRef = useRef<ImperativePanelHandle>(null);

  const onResizeHandleDragging = useCallback(
    debounce(() => {
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
    [promptData?.previewWidthPercent, panelChildRef?.current],
  );

  // useEffect(() => {
  //   if (promptData?.previewWidthPercent) {
  //     panelChildRef.current?.resize(promptData.previewWidthPercent);
  //   }
  // }, [promptData?.previewWidthPercent]);

  const defaultRightPanelWidth = 60;
  // const panelLeftStyle = useMemo(
  //   () => ({
  //     flexGrow:
  //       100 - (promptData?.previewWidthPercent || defaultRightPanelWidth),
  //   }),
  //   [promptData?.previewWidthPercent],
  // );

  // const panelRightStyle = useMemo(
  //   () => ({
  //     flexGrow: promptData?.previewWidthPercent || defaultRightPanelWidth,
  //   }),
  //   [promptData?.previewWidthPercent],
  // );

  return (
    <ErrorBoundary>
      {
        <div
          id="main-container"
          ref={appRef}
          className={`
min-w-screen relative
h-screen min-h-screen
w-screen
overflow-hidden
text-text-base
      `}
        >
          <span className="font-mono text-xxs font-bold absolute top-[-100px] left-[-100px]">
            .
          </span>
          {promptData?.css && <style>{promptData?.css}</style>}
          <style>{css}</style>
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
          {audioDot && <AudioDot />}
          {loading && <LoadingDot />}
          {progress > 0 && <ProgressBar />}
          {processes.length > 1 && isMainScript && <ProcessesDot />}
          {/* {ui} {choices.length} {promptData?.scriptPath} */}
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
        flex h-full
        w-full flex-col
        relative
        `}
            onMouseDown={onMouseDown}
            onMouseUp={onMouseUp}
            onMouseLeave={onMouseLeave}
            onMouseMove={onMouseMove}
            onMouseEnter={onMouseMove}
          >
            {ui !== UI.log && (
              // header id using in resize measuring
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
                  <>
                    {submitted && (
                      <input
                        style={{
                          position: 'absolute',
                          top: -1000,
                          left: -1000,
                        }}
                        ref={submittedInputRef}
                        onChange={(e) => {
                          log.info(`Change while submitted: ${e.target.value}`);
                          setInputWhileSubmitted(e.target.value);
                        }}
                      />
                    )}
                    <Input key="AppInput" />
                    {!showTabs && <div className="border-b border-ui-border" />}
                  </>
                )}

                {hint && <Hint key="AppHint" />}

                {showTabs && <div>{showTabs && <Tabs key="AppTabs" />}</div>}
              </header>
            )}
            {logVisible && <Console key="AppLog" />}
            {/* <span className="text-xxs">
              {pid}
              {shortcodes}
            </span> */}

            <main
              id="main"
              className="min-h-[1px] w-full flex-1 overflow-y-hidden"
            >
              {flagValue && <ActionsList key="ActionsList" />}

              <PanelGroup
                direction="horizontal"
                autoSaveId={script.filePath}
                className={`flex h-full w-full flex-row
${showTabs ? 'border-t border-ui-border' : ''}

            `}
              >
                <PanelChild
                  minSize={25}
                  id="panel-left"
                  // style={panelLeftStyle}
                  order={1}
                >
                  <div className="h-full min-h-1 overflow-x-hidden">
                    <ToastContainer
                      pauseOnFocusLoss={false}
                      position="bottom-right"
                      toastStyle={{
                        maxHeight: document.body.clientHeight,
                      }}
                      transition={cssTransition({
                        // don't fade in/out
                        enter: 'toast-fade-in',
                        exit: 'toast-fade-out',
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
                      <AutoSizer disableWidth>
                        {({ height }) => <List height={height} />}
                      </AutoSizer>
                    )}
                    {(!!(ui === UI.arg || ui === UI.div) &&
                      panelHTML.length > 0 && <Panel />) ||
                      (ui === UI.form && <Form />)}
                  </div>
                </PanelChild>

                {showRightPanel && (
                  <>
                    <PanelResizeHandle
                      id="panel-resize-handle"
                      className="w-0.5 border-l-1 border-ui-border hover:-ml-0.5 hover:w-3 hover:border-r-1 hover:border-white/10 hover:bg-white/5"
                      onDragging={onResizeHandleDragging}
                    />

                    <PanelChild
                      id="panel-right"
                      ref={panelChildRef}
                      // style={panelRightStyle}
                      order={2}
                    >
                      <Preview />
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
      }

      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <audio id="audio" />
    </ErrorBoundary>
  );
}
