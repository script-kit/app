/* eslint-disable react-hooks/exhaustive-deps */
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
/* eslint-disable jsx-a11y/no-autofocus */
/* eslint-disable jsx-a11y/label-has-associated-control */
import React, {
  ErrorInfo,
  RefObject,
  useCallback,
  useEffect,
  useRef,
} from 'react';
import log from 'electron-log/renderer';
import { ToastContainer } from 'react-toastify';
import { debounce } from 'lodash';
import path from 'path';
import { loader } from '@monaco-editor/react';

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
  topHeightAtom,
  uiAtom,
  topRefAtom,
  appConfigAtom,
  isHiddenAtom,
  scoredChoicesAtom,
  showTabsAtom,
  showSelectedAtom,
  processesAtom,
  onPasteAtom,
  onDropAtom,
  kitStateAtom,
  userAtom,
  chatMessagesAtom,
  termConfigAtom,
  zoomAtom,
  hasBorderAtom,
  channelAtom,
  logVisibleAtom,
  domUpdatedAtom,
  headerHiddenAtom,
  footerHiddenAtom,
  appBoundsAtom,
  flaggedChoiceValueAtom,
  previewCheckAtom,
  resetPromptAtom,
  loadingAtom,
  audioDotAtom,
  isMainScriptAtom,
} from './jotai';

import {
  useEnter,
  useEscape,
  useMessages,
  useShortcuts,
  useThemeDetector,
} from './hooks';
import Splash from './components/splash';
import Emoji from './components/emoji';
import { AppChannel } from './enums';
import Terminal from './term';
import Inspector from './components/inspector';
import { Chat } from './components/chat';
import AudioRecorder from './audio-recorder';
import Webcam from './webcam';
import Preview from './components/preview';
import FlagsList from './components/flags';
import AudioDot from './audio-dot';
import LoadingDot from './loading-dot';
import ProcessesDot from './processes-dot';

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
  const [pid] = useAtom(pidAtom);
  const [appConfig] = useAtom(appConfigAtom);
  const [open] = useAtom(openAtom);
  const [script] = useAtom(scriptAtom);
  const [hint] = useAtom(hintAtom);
  const [panelHTML] = useAtom(panelHTMLAtom);
  const [hidden] = useAtom(isHiddenAtom);
  const [chatMessages] = useAtom(chatMessagesAtom);

  const [ui] = useAtom(uiAtom);
  const loading = useAtomValue(loadingAtom);
  const choices = useAtomValue(scoredChoicesAtom);
  const showSelected = useAtomValue(showSelectedAtom);
  const showTabs = useAtomValue(showTabsAtom);
  const onPaste = useAtomValue(onPasteAtom);
  const onDrop = useAtomValue(onDropAtom);
  const logVisible = useAtomValue(logVisibleAtom);

  const [promptData] = useAtom(promptDataAtom);

  const resetPrompt = useSetAtom(resetPromptAtom);
  const setMainHeight = useSetAtom(mainHeightAtom);
  const setTopHeight = useSetAtom(topHeightAtom);
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

  const previewCheck = useAtomValue(previewCheckAtom);
  const showRightPanel = (previewCheck && !kitState.noPreview) || flagValue;
  // log({
  //   previewCheck: previewCheck ? '✅' : '🚫',
  //   previewHTML: previewHTML?.length,
  //   panelHTML: panelHTML?.length,
  //   previewEnabled,
  //   hidden,
  // });

  const [zoomLevel, setZoom] = useAtom(zoomAtom);

  const hasBorder = useAtomValue(hasBorderAtom);

  const channel = useAtomValue(channelAtom);

  const domUpdated = useSetAtom(domUpdatedAtom);
  const setAppBounds = useSetAtom(appBoundsAtom);

  const audioDot = useAtomValue(audioDotAtom);

  useMessages();

  useEffect(() => {
    log.info(`👩‍💻 UI changed to: ${ui}`);
  }, [ui]);

  useEffect(() => {
    document.addEventListener('visibilitychange', () => {
      log.info(`👁️‍🗨️ visibilitychange: ${document.visibilityState}`);
    });
  }, []);

  useEffect(() => {
    (window as any)._resetPrompt = async () => {
      log.info(`Resetting prompt...`);
      return resetPrompt();
    };

    (window as any).log = log;
  }, []);

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
    [pid]
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
    [promptData?.previewWidthPercent, panelChildRef?.current]
  );

  return (
    <ErrorBoundary>
      <div
        id="main-container"
        ref={appRef}
        className={`
min-w-screen relative
h-screen min-h-screen
w-screen
overflow-hidden
text-text-base
${hasBorder ? `border-1 border-ui-border` : ``}
${appConfig.isMac && hasBorder ? `main-rounded` : ``}
      `}
      >
        <style>{promptData?.css}</style>
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
        {processes.length > 1 && isMainScript && <ProcessesDot />}

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
        `}
          onMouseDown={onMouseDown}
          onMouseUp={onMouseUp}
          onMouseLeave={onMouseLeave}
          onMouseMove={onMouseMove}
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
                  <Input key="AppInput" />
                  {!showTabs && !showSelected && (
                    <div className="border-b border-ui-border" />
                  )}
                </>
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
                <div className="min-h-1 h-full overflow-x-hidden">
                  <ToastContainer
                    className="-mt-3 -ml-3"
                    pauseOnFocusLoss={false}
                    position="top-right"
                    toastStyle={{
                      maxHeight: document.body.clientHeight,
                    }}
                    // transition={cssTransition({
                    //   // don't fade in/out
                    //   // enter: 'animate__animated animate__slideInUp',
                    //   // exit: 'animate__animated animate__slideOutDown',
                    //   collapseDuration: 0,
                    //   collapse: true,
                    // })}
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

              {/* {previewEnabled && <Preview />} */}

              {showRightPanel && (
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
                    {flagValue ? (
                      <AutoSizer disableWidth>
                        {({ height }) => <FlagsList height={height} />}
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
