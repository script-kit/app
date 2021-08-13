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
import { useAtom } from 'jotai';
import AutoSizer from 'react-virtualized-auto-sizer';
import useResizeObserver from '@react-hook/resize-observer';
import { useDebouncedCallback } from 'use-debounce';
import { ipcRenderer } from 'electron';

import { Channel, Mode, UI } from 'kit-bridge/cjs/enum';
import Tabs from './components/tabs';
import List from './components/list';
import Input from './components/input';
import Drop from './components/drop';
import Editor from './components/editor';
import Hotkey from './components/hotkey';
import Hint from './components/hint';
import Selected from './components/selected';
import TextArea from './components/textarea';
import Panel from './components/panel';
import Log from './components/log';
import Header from './components/header';
import Form from './components/form';
import {
  choicesAtom,
  editorConfigAtom,
  flagsAtom,
  flagValueAtom,
  formDataAtom,
  formHTMLAtom,
  hintAtom,
  inputAtom,
  isMouseDownAtom,
  logHTMLAtom,
  mainHeightAtom,
  modeAtom,
  mouseEnabledAtom,
  openAtom,
  panelHTMLAtom,
  pidAtom,
  placeholderAtom,
  promptDataAtom,
  scriptAtom,
  selectedAtom,
  submittedAtom,
  submitValueAtom,
  tabIndexAtom,
  tabsAtom,
  textareaConfigAtom,
  themeAtom,
  topHeightAtom,
  uiAtom,
  unfilteredChoicesAtom,
} from './jotai';

import useChoices from './hooks/useChoices';
import { useThemeDetector } from './hooks';

const second = (fn: (value: any) => void) => (_: any, x: any) => fn(x);

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
    ipcRenderer.send('PROMPT_ERROR', { error });
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
  const [open, setOpen] = useAtom(openAtom);
  const [script, setScript] = useAtom(scriptAtom);

  const [inputValue, setInput] = useAtom(inputAtom);
  const [, setPlaceholder] = useAtom(placeholderAtom);
  const [promptData, setPromptData] = useAtom(promptDataAtom);
  const [, setTheme] = useAtom(themeAtom);
  const [submitted] = useAtom(submittedAtom);

  const [, setUnfilteredChoices] = useAtom(unfilteredChoicesAtom);
  const [choices] = useAtom(choicesAtom);

  const [ui] = useAtom(uiAtom);
  const [hint, setHint] = useAtom(hintAtom);
  const [mode, setMode] = useAtom(modeAtom);

  const [tabIndex, setTabIndex] = useAtom(tabIndexAtom);
  const [tabs] = useAtom(tabsAtom);

  const [panelHTML, setPanelHTML] = useAtom(panelHTMLAtom);
  const [logHtml, setLogHtml] = useAtom(logHTMLAtom);
  const [, setEditorConfig] = useAtom(editorConfigAtom);
  const [, setTextareaConfig] = useAtom(textareaConfigAtom);
  const [, setFlags] = useAtom(flagsAtom);
  const [formHTML, setFormHTML] = useAtom(formHTMLAtom);
  const [, setFormData] = useAtom(formDataAtom);

  const [mainHeight, setMainHeight] = useAtom(mainHeightAtom);
  const [topHeight, setTopHeight] = useAtom(topHeightAtom);

  const [, setSubmitValue] = useAtom(submitValueAtom);
  const [flagValue] = useAtom(flagValueAtom);
  const [mouseEnabled, setMouseEnabled] = useAtom(mouseEnabledAtom);
  const [selected] = useAtom(selectedAtom);

  const mainRef: RefObject<HTMLDivElement> = useRef(null);
  const windowContainerRef: RefObject<HTMLDivElement> = useRef(null);
  const headerRef: RefObject<HTMLDivElement> = useRef(null);

  useResizeObserver(headerRef, (entry) => {
    setTopHeight(entry.contentRect.height);
  });

  useThemeDetector();

  const [isMouseDown, setIsMouseDown] = useAtom(isMouseDownAtom);

  // useEffect(() => {
  //   if (choices?.length > 0 && choices?.[index]) {
  //     ipcRenderer.send(CHOICE_FOCUSED, {
  //       index,
  //       pid,
  //     });
  //   }
  //   if (choices?.length === 0) {
  //     ipcRenderer.send(CHOICE_FOCUSED, { index: null, pid });
  //   }
  // }, [choices, index, pid]);

  useChoices();

  const generateChoices = useDebouncedCallback((input, mode) => {
    if (mode === Mode.GENERATE) {
      ipcRenderer.send(Channel.GENERATE_CHOICES, {
        input,
        pid,
      });
    }
  }, 150);

  useEffect(() => {
    if (!submitted) generateChoices(inputValue, mode);
  }, [mode, inputValue, tabIndex, submitted, generateChoices]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const messageMap = {
    // [Channel.RESET_PROMPT]: resetPromptHandler,
    [Channel.EXIT]: second(setOpen),
    [Channel.SET_PID]: second(setPid),
    [Channel.SET_SCRIPT]: second(setScript),
    [Channel.SET_CHOICES]: second(setUnfilteredChoices),
    [Channel.SET_EDITOR_CONFIG]: second(setEditorConfig),
    [Channel.SET_TEXTAREA_CONFIG]: second(setTextareaConfig),
    [Channel.SET_FLAGS]: second(setFlags),
    [Channel.SET_DIV_HTML]: second(setPanelHTML),
    [Channel.SET_FORM_HTML]: (event: any, { html, formData }: any) => {
      setFormHTML(html);
      setFormData(formData);
    },
    [Channel.SET_HINT]: second(setHint),
    [Channel.SET_INPUT]: second(setInput),
    [Channel.SET_MODE]: second(setMode),
    [Channel.SET_PANEL]: second(setPanelHTML),
    [Channel.SET_LOG]: second(setLogHtml),
    [Channel.SET_PLACEHOLDER]: second(setPlaceholder),
    [Channel.SET_TAB_INDEX]: second(setTabIndex),
    [Channel.SET_PROMPT_DATA]: second(setPromptData),
    [Channel.SET_THEME]: second(setTheme),
  };

  useEffect(() => {
    Object.entries(messageMap).forEach(([key, value]: any) => {
      if (ipcRenderer.listenerCount(key) === 0) {
        ipcRenderer.on(key, (event, data) => {
          // if (data?.kitScript) setScriptName(data?.kitScript);
          value(event, data);
        });
      }
    });

    return () => {
      Object.entries(messageMap).forEach(([key, value]: any) => {
        ipcRenderer.off(key, value);
      });
    };
  }, [messageMap]);

  const onMouseDown = useCallback(() => {
    setIsMouseDown(true);
  }, [setIsMouseDown]);
  const onMouseUp = useCallback(() => {
    setIsMouseDown(false);
  }, [setIsMouseDown]);

  const onMouseMove = useCallback(() => {
    setMouseEnabled(mouseEnabled + 1);
  }, [setMouseEnabled, mouseEnabled]);

  return (
    <ErrorBoundary>
      <div
        ref={windowContainerRef}
        style={
          {
            WebkitAppRegion: 'drag',
            WebkitUserSelect: 'none',
            cursor: mouseEnabled > 10 ? 'pointer' : 'none',
          } as any
        }
        className="relative flex flex-col w-full h-full"
        onMouseDown={onMouseDown}
        onMouseUp={onMouseUp}
        onMouseMove={onMouseMove}
      >
        <header ref={headerRef}>
          {(script?.description || script?.twitter || script?.menu) && (
            <Header />
          )}
          {!!(ui & UI.hotkey) && (
            <Hotkey
              submit={setSubmitValue}
              onHotkeyHeightChanged={setMainHeight}
            />
          )}
          {!!(ui & UI.arg) && <Input />}
          {selected && <Selected />}
          {hint && <Hint />}
          {tabs?.length > 0 && !flagValue && <Tabs />}
          {logHtml?.length > 0 && script.log && <Log />}
        </header>
        <main
          ref={mainRef}
          className={`
        h-full w-full
        border-transparent
        border-b
        `}
        >
          {!!(ui & UI.drop) && <Drop />}
          {!!(ui & UI.textarea) && <TextArea />}
          {!!(ui & UI.editor) && <Editor />}
          {!!(ui & UI.form) && <Form />}

          <AutoSizer>
            {({ width, height }) => (
              <>
                {!!(ui & (UI.arg | UI.hotkey | UI.div)) &&
                  panelHTML?.length > 0 && (
                    <Panel width={width} height={height} />
                  )}
                {!!(ui & UI.arg) && panelHTML?.length === 0 && (
                  <List height={height} width={width} />
                )}
              </>
            )}
          </AutoSizer>
        </main>
      </div>
    </ErrorBoundary>
  );
}
