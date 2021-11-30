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
import { ipcRenderer } from 'electron';

import { Channel, UI } from '@johnlindquist/kit/cjs/enum';
import { ChannelMap, KeyData } from '@johnlindquist/kit/types/kitapp';
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
  scoredChoices,
  editorConfigAtom,
  flagsAtom,
  flagValueAtom,
  formDataAtom,
  formHTMLAtom,
  hintAtom,
  indexAtom,
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
  previewHTMLAtom,
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
  isKitScriptAtom,
  topRefAtom,
  descriptionAtom,
  nameAtom,
  textareaValueAtom,
} from './jotai';

import { useThemeDetector } from './hooks';

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
  const [open, setOpen] = useAtom(openAtom);
  const [script, setScript] = useAtom(scriptAtom);
  const [description] = useAtom(descriptionAtom);
  const [name] = useAtom(nameAtom);
  const [isKitScript] = useAtom(isKitScriptAtom);

  const [inputValue, setInput] = useAtom(inputAtom);
  const [, setPlaceholder] = useAtom(placeholderAtom);
  const [promptData, setPromptData] = useAtom(promptDataAtom);
  const [, setTheme] = useAtom(themeAtom);
  const [submitted] = useAtom(submittedAtom);

  const [, setUnfilteredChoices] = useAtom(unfilteredChoicesAtom);

  const [ui] = useAtom(uiAtom);
  const [hint, setHint] = useAtom(hintAtom);
  const [mode, setMode] = useAtom(modeAtom);

  const [tabIndex, setTabIndex] = useAtom(tabIndexAtom);
  const [tabs] = useAtom(tabsAtom);

  const [panelHTML, setPanelHTML] = useAtom(panelHTMLAtom);
  const [previewHTML, setPreviewHTML] = useAtom(previewHTMLAtom);
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
  const [index] = useAtom(indexAtom);
  const [choices] = useAtom(scoredChoices);
  const [, setTopRef] = useAtom(topRefAtom);
  const [, setDescription] = useAtom(descriptionAtom);
  const [, setName] = useAtom(nameAtom);
  const [, setTextareaValue] = useAtom(textareaValueAtom);

  const mainRef: RefObject<HTMLDivElement> = useRef(null);
  const windowContainerRef: RefObject<HTMLDivElement> = useRef(null);
  const headerRef: RefObject<HTMLDivElement> = useRef(null);

  useResizeObserver(headerRef, (entry) => {
    setTopHeight(entry.contentRect.height);
  });

  useThemeDetector();

  const [isMouseDown, setIsMouseDown] = useAtom(isMouseDownAtom);

  type ChannelAtomMap = {
    [key in keyof ChannelMap]: (data: ChannelMap[key]) => void;
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const messageMap: ChannelAtomMap = {
    // [Channel.RESET_PROMPT]: resetPromptHandler,
    [Channel.EXIT]: setOpen,
    [Channel.SET_PID]: setPid,
    [Channel.SET_SCRIPT]: setScript,
    [Channel.SET_UNFILTERED_CHOICES]: setUnfilteredChoices,
    [Channel.SET_DESCRIPTION]: setDescription,
    [Channel.SET_EDITOR_CONFIG]: setEditorConfig,
    [Channel.SET_TEXTAREA_CONFIG]: setTextareaConfig,
    [Channel.SET_FLAGS]: setFlags,
    [Channel.SET_DIV_HTML]: setPanelHTML,
    [Channel.SET_FORM_HTML]: ({ html, formData }: any) => {
      setFormHTML(html);
      setFormData(formData);
    },
    [Channel.SET_HINT]: setHint,
    [Channel.SET_INPUT]: setInput,
    [Channel.SET_MODE]: setMode,
    [Channel.SET_NAME]: setName,
    [Channel.SET_TEXTAREA_VALUE]: setTextareaValue,
    [Channel.SET_PANEL]: setPanelHTML,
    [Channel.SET_PREVIEW]: setPreviewHTML,
    [Channel.SET_LOG]: setLogHtml,
    [Channel.SET_PLACEHOLDER]: setPlaceholder,
    [Channel.SET_SUBMIT_VALUE]: setSubmitValue,
    [Channel.SET_TAB_INDEX]: setTabIndex,
    [Channel.SET_PROMPT_DATA]: setPromptData,
    [Channel.SET_THEME]: setTheme,

    [Channel.SEND_KEYSTROKE]: (keyData: Partial<KeyData>) => {
      const keyboardEvent = new KeyboardEvent('keydown', {
        bubbles: true,
        ctrlKey: keyData.command || keyData.control,
        shiftKey: keyData.shift,
        altKey: keyData.option,
        ...keyData,
      });
      document?.activeElement?.dispatchEvent(keyboardEvent);
    },
  };

  useEffect(() => {
    Object.entries(messageMap).forEach(([key, fn]) => {
      if (ipcRenderer.listenerCount(key) === 0) {
        ipcRenderer.on(key, (_, data) => {
          // if (data?.kitScript) setScriptName(data?.kitScript);
          (fn as (data: ChannelAtomMap[keyof ChannelAtomMap]) => void)(data);
        });
      }
    });

    return () => {
      Object.entries(messageMap).forEach(([key, fn]) => {
        ipcRenderer.off(key, fn);
      });
    };
  }, [messageMap]);

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
  }, [headerRef]);

  return (
    <ErrorBoundary>
      <div
        ref={windowContainerRef}
        style={
          {
            WebkitUserSelect: 'none',
          } as any
        }
        className="relative flex flex-col w-full h-full"
        onMouseDown={onMouseDown}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseLeave}
        onMouseMove={onMouseMove}
      >
        <header ref={headerRef}>
          <Header />
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
          {logHtml?.length > 0 && script?.log !== 'false' && !isKitScript && (
            <Log />
          )}
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
                    <>
                      <Panel width={width} height={height} />
                    </>
                  )}
                {!!(ui & UI.arg) && panelHTML?.length === 0 && (
                  <>
                    <List height={height} width={width} />
                  </>
                )}
              </>
            )}
          </AutoSizer>
        </main>
      </div>
    </ErrorBoundary>
  );
}
