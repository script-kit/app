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
  KeyboardEvent,
  RefObject,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { useAtom } from 'jotai';
import AutoSizer, { Size } from 'react-virtualized-auto-sizer';
import { useDebouncedCallback } from 'use-debounce';
import { ipcRenderer } from 'electron';
import { clamp, partition } from 'lodash';
import parse from 'html-react-parser';
import { KeyCode } from 'monaco-editor';
import { Channel, Mode, UI } from 'kit-bridge/cjs/enum';
import {
  PromptData,
  Choice,
  Script,
  EditorConfig,
  EditorRef,
} from 'kit-bridge/esm/type';
import Tabs from './components/tabs';
import List from './components/list';
import Input from './components/input';
import Drop from './components/drop';
import Editor from './components/editor';
import Hotkey from './components/hotkey';
import TextArea from './components/textarea';
import Panel from './components/panel';
import Header from './components/header';
import Form from './components/form';
import { highlightChoiceName } from './highlight';
import {
  choicesAtom,
  editorConfigAtom,
  formDataAtom,
  formHTMLAtom,
  hintAtom,
  indexAtom,
  inputAtom,
  maxHeightAtom,
  modeAtom,
  panelHTMLAtom,
  pidAtom,
  placeholderAtom,
  promptDataAtom,
  scriptAtom,
  submittedAtom,
  tabIndexAtom,
  tabsAtom,
  textareaConfigAtom,
  uiAtom,
  unfilteredChoicesAtom,
} from './jotai';

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
      return <div>{info.componentStack}</div>;
    }

    return children;
  }
}

export default function App() {
  const [pid, setPid] = useAtom(pidAtom);
  const [script, setScript] = useAtom(scriptAtom);

  const [index, setIndex] = useAtom(indexAtom);
  const [inputValue, setInputValue] = useAtom(inputAtom);
  const [placeholder, setPlaceholder] = useAtom(placeholderAtom);
  const [promptData, setPromptData] = useAtom(promptDataAtom);
  const [submitted, setSubmitted] = useAtom(submittedAtom);

  const [unfilteredChoices, setUnfilteredChoices] = useAtom(
    unfilteredChoicesAtom
  );
  const [filteredChoices, setFilteredChoices] = useAtom(choicesAtom);

  const [ui, setUI] = useAtom(uiAtom);
  const [hint, setHint] = useAtom(hintAtom);
  const [mode, setMode] = useAtom(modeAtom);

  const [tabIndex, setTabIndex] = useAtom(tabIndexAtom);
  const [tabs, setTabs] = useAtom(tabsAtom);

  const [panelHTML, setPanelHTML] = useAtom(panelHTMLAtom);
  const [editorConfig, setEditorConfig] = useAtom(editorConfigAtom);
  const [textareaConfig, setTextareaConfig] = useAtom(textareaConfigAtom);
  const [formHTML, setFormHTML] = useAtom(formHTMLAtom);
  const [formData, setFormData] = useAtom(formDataAtom);

  const [maxHeight, setMaxHeight] = useAtom(maxHeightAtom);

  const choicesListRef = useRef(null);
  const panelRef: RefObject<HTMLElement> = useRef(null);
  const inputRef: RefObject<HTMLInputElement> = useRef(null);
  const textAreaRef: RefObject<HTMLTextAreaElement> = useRef(null);
  const mainRef: RefObject<HTMLDivElement> = useRef(null);
  const windowContainerRef: RefObject<HTMLDivElement> = useRef(null);
  const topRef: RefObject<HTMLDivElement> = useRef(null);
  const editorRef: RefObject<EditorRef> = useRef(null);

  const resizeHeight = useDebouncedCallback(
    useCallback(
      (height: number) => {
        const { height: topHeight } =
          topRef?.current?.getBoundingClientRect() as any;

        if (height === topHeight && ui === UI.form) return;

        const promptHeight = height > topHeight ? height : topHeight;

        const newHeight = Math.round(promptHeight);

        if (ui === UI.arg || ui === UI.form) {
          ipcRenderer.send(Channel.CONTENT_HEIGHT_UPDATED, newHeight);
        }
      },
      [ui]
    ),
    50
  );

  const setMainHeight = useCallback(
    (mainHeight) => {
      const { height: topHeight } =
        topRef?.current?.getBoundingClientRect() as any;

      const bottomHeight =
        filteredChoices.length === 0 && panelHTML === '' && formHTML === ''
          ? 0
          : mainHeight;
      const fullHeight = topHeight + bottomHeight;

      const height = fullHeight < maxHeight ? fullHeight : maxHeight;
      console.log({ mainHeight, height });

      resizeHeight(height);
    },
    [filteredChoices.length, panelHTML, formHTML, maxHeight, resizeHeight]
  );

  const clampIndex = useCallback(
    (i) => {
      const clampedIndex = clamp(i, 0, filteredChoices.length - 1);
      setIndex(clampedIndex);
    },
    [filteredChoices.length, setIndex]
  );

  const submit = useCallback(
    (submitValue: any) => {
      // setFilteredChoices([]);
      // setUnfilteredChoices([]);

      let value = submitValue;

      setPlaceholder(
        typeof submitValue === 'string' && !promptData?.secret
          ? submitValue
          : 'Processing...'
      );

      // setUnfilteredChoices([]);
      // setPanelHTML('');

      if (Array.isArray(submitValue)) {
        const files = submitValue.map((file) => {
          const fileObject: any = {};

          for (const key in file) {
            const value = file[key];
            const notFunction = typeof value !== 'function';
            if (notFunction) fileObject[key] = value;
          }

          return fileObject;
        });

        value = files;
      }

      ipcRenderer.send(Channel.VALUE_SUBMITTED, {
        value,
        pid,
      });

      setSubmitted(true);
      setInputValue('');
    },
    [pid, promptData?.secret]
  );

  const onIndexSubmit = useCallback(
    (i) => {
      if (filteredChoices.length) {
        const choice = filteredChoices[i];

        submit(choice.value);
      }
    },
    [filteredChoices, submit]
  );

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

  const onTabClick = useCallback(
    (ti: number) => (_event: any) => {
      setTabIndex(ti);

      ipcRenderer.send(Channel.TAB_CHANGED, {
        tab: tabs[ti],
        input: inputValue,
        pid,
      });
    },
    [inputValue, pid, tabs]
  );

  const closePrompt = useCallback(() => {
    ipcRenderer.send(Channel.ESCAPE_PRESSED, { pid });
    // setChoices([]);
    setUnfilteredChoices([]);
    setTabIndex(0);
    setIndex(0);
    setInputValue('');
    setPanelHTML('');
    setFormHTML('');
    setPromptData({});
    setHint('');
  }, [pid]);

  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closePrompt();

        return;
      }

      if (event.key === 'Enter') {
        if (filteredChoices.length) {
          submit(filteredChoices?.[index].value);
        } else {
          submit(inputValue);
        }
        return;
      }

      if (event.key === ' ') {
        const tab = tabs.find((tab) =>
          tab.toLowerCase().startsWith(inputValue?.toLowerCase())
        );

        if (tab) {
          const ti = tabs.indexOf(tab);
          setTabIndex(ti);
          setInputValue('');
          ipcRenderer.send(Channel.TAB_CHANGED, {
            tab,
            input: inputValue,
            pid,
          });
          event.preventDefault();
          return;
        }

        const shortcodeChoice = unfilteredChoices?.find(
          (choice) => choice?.shortcode === inputValue.trim()
        );
        if (shortcodeChoice) {
          submit(shortcodeChoice.value);
          event.preventDefault();
          return;
        }
      }

      if (event.key === 'Tab') {
        event.preventDefault();
        if (tabs?.length) {
          const maxTab = tabs.length;
          const clampTabIndex = (tabIndex + (event.shiftKey ? -1 : 1)) % maxTab;
          const nextIndex = clampTabIndex < 0 ? maxTab - 1 : clampTabIndex;
          setTabIndex(nextIndex);
          ipcRenderer.send(Channel.TAB_CHANGED, {
            tab: tabs[nextIndex],
            input: inputValue,
            pid,
          });
        }
        return;
      }

      if (event.key === 'ArrowDown') {
        event.preventDefault();
        clampIndex(index + 1);
        return;
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        clampIndex(index - 1);
        // return;
      }
    },
    [
      closePrompt,
      submit,
      filteredChoices,
      index,
      inputValue,
      tabs,
      unfilteredChoices,
      pid,
      tabIndex,
      clampIndex,
    ]
  );

  const generateChoices = useDebouncedCallback((input, mode, tab) => {
    if (mode === Mode.GENERATE) {
      ipcRenderer.send(Channel.GENERATE_CHOICES, {
        input,
        pid,
      });
    }
  }, 150);

  useEffect(() => {
    if (!submitted) generateChoices(inputValue, mode, tabIndex);
  }, [mode, inputValue, tabIndex, submitted, generateChoices]);

  useEffect(() => {
    try {
      if (inputValue === '') {
        setFilteredChoices(unfilteredChoices);
        return;
      }
      if (mode === (Mode.GENERATE || Mode.MANUAL)) {
        setFilteredChoices(unfilteredChoices);
        return;
      }
      if (!unfilteredChoices?.length) {
        setFilteredChoices([]);
        return;
      }

      if (submitted) return;

      const input = inputValue?.toLowerCase() || '';

      const startExactFilter = (choice: Choice) => {
        return (choice.name as string)?.toLowerCase().startsWith(input);
      };

      const startEachWordFilter = (choice: Choice) => {
        let wordIndex = 0;
        let wordLetterIndex = 0;
        const words = (choice.name as string)?.toLowerCase().match(/\w+\W*/g);
        if (!words) return false;
        const inputLetters: string[] = input.split('');

        const checkNextLetter = (inputLetter: string): boolean => {
          const word = words[wordIndex];
          const letter = word[wordLetterIndex];

          if (inputLetter === letter) {
            wordLetterIndex += 1;
            return true;
          }

          return false;
        };

        const checkNextWord = (inputLetter: string): boolean => {
          wordLetterIndex = 0;
          wordIndex += 1;

          const word = words[wordIndex];
          if (!word) return false;
          const letter = word[wordLetterIndex];
          if (!letter) return false;

          if (inputLetter === letter) {
            wordLetterIndex += 1;
            return true;
          }

          return checkNextWord(inputLetter);
        };
        return inputLetters.every((inputLetter: string) => {
          if (checkNextLetter(inputLetter)) {
            return true;
          }
          return checkNextWord(inputLetter);
        });
      };

      const startFirstAndEachWordFilter = (choice: any) => {
        return (
          choice.name?.toLowerCase().startsWith(input[0]) &&
          startEachWordFilter(choice)
        );
      };

      const partialFilter = (choice: any) =>
        choice.name?.toLowerCase().includes(input);

      const [startExactMatches, notBestMatches] = partition(
        unfilteredChoices,
        startExactFilter
      );

      const [startAndFirstMatches, notStartMatches] = partition(
        notBestMatches,
        startFirstAndEachWordFilter
      );

      const [startMatches, notStartAndFirstMatches] = partition(
        notStartMatches,
        startEachWordFilter
      );
      const [partialMatches, notMatches] = partition(
        notStartAndFirstMatches,
        partialFilter
      );

      const filtered = [
        ...startExactMatches,
        ...startAndFirstMatches,
        ...startMatches,
        ...partialMatches,
      ];

      const highlightedChoices = filtered.map((choice) => {
        return {
          ...choice,
          name: highlightChoiceName(choice.name as string, inputValue),
        };
      });
      setFilteredChoices(highlightedChoices);
    } catch (error) {
      ipcRenderer.send('PROMPT_ERROR', { error, pid });
    }
  }, [
    unfilteredChoices,
    inputValue,
    mode,
    pid,
    resizeHeight,
    submitted,
    setMainHeight,
  ]);

  const setPromptDataHandler = useCallback(
    (_event: any, promptData: PromptData) => {
      setIndex(0);
      setPanelHTML('');
      setPromptData(promptData);
      setPlaceholder(promptData.placeholder);
      setUI(promptData.ui);
      setTabs(promptData?.tabs || []);

      if (inputRef.current) {
        inputRef?.current.focus();
      }

      if (textAreaRef.current) {
        textAreaRef?.current.focus();
      }
    },
    []
  );

  const setTabIndexHandler = useCallback((_event: any, ti: number) => {
    setSubmitted(false);

    setPanelHTML('');
    setTabIndex(ti);
  }, []);

  const setPlaceholderHandler = useCallback((_event: any, text: string) => {
    setPlaceholder(text);
  }, []);

  const setPanelHandler = useCallback((_event: any, html: string) => {
    setFilteredChoices([]);
    setUnfilteredChoices([]);
    setPanelHTML(html);
  }, []);

  const setModeHandler = useCallback((_event: any, mode: Mode) => {
    setMode(mode);
  }, []);

  const setHintHandler = useCallback((_event: any, hint: string) => {
    setHint(hint);
  }, []);

  const setInputHandler = useCallback((_event: any, input: string) => {
    setSubmitted(false);

    setInputValue(input);
  }, []);

  const setChoicesHandler = useCallback(
    (_event: any, rawChoices: Choice[]) => {
      if (ui !== UI.arg) return;
      setIndex(0);
      setSubmitted(false);
      setPanelHTML('');
      setUnfilteredChoices(rawChoices);
      const topHeight = (topRef.current as HTMLElement).clientHeight;
      const mainHeight = (mainRef.current as HTMLElement).clientHeight;

      if (rawChoices.length === 0) {
        resizeHeight(topHeight);
      }

      if (filteredChoices.length > 0 && mainHeight < topHeight * 2) {
        resizeHeight(topHeight * 4);
      }
      // setMaxHeight(window.innerHeight);
    },
    [filteredChoices.length, resizeHeight]
  );

  const setTextareaConfigHandler = useCallback(
    (_event: any, config: EditorConfig) => {
      setTextareaConfig(config);
    },
    [setTextareaConfig]
  );

  const setEditorConfigHandler = useCallback(
    (_event: any, config: EditorConfig) => {
      setEditorConfig(config);
    },
    [setEditorConfig]
  );

  const setPidHandler = useCallback(
    (_event, pid: number) => {
      setPid(pid);
    },
    [setPid]
  );

  const setScriptHandler = useCallback(
    (_event, script: Script) => {
      // resetPromptHandler();
      setSubmitted(false);
      setScript(script);
      setTabs(script.tabs || []);
      setTabIndex(0);
      setInputValue('');
    },
    [setInputValue, setScript, setSubmitted, setTabIndex, setTabs]
  );

  const setMaxHeightHandler = useCallback(
    (event, height) => {
      setMaxHeight(height);
    },
    [setMaxHeight]
  );

  const setFormHTMLHandler = useCallback(
    (event, { html, formData }) => {
      setFormHTML(html);
      setFormData(formData);
    },
    [setFormHTML]
  );

  const exitHandler = useCallback(
    (event) => {
      setIndex(0);

      console.log(`EXITING ${pid}`);
    },
    [pid, setIndex]
  );

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const messageMap = {
    // [Channel.RESET_PROMPT]: resetPromptHandler,
    [Channel.EXIT]: exitHandler,
    [Channel.SET_PID]: setPidHandler,
    [Channel.SET_SCRIPT]: setScriptHandler,
    [Channel.SET_CHOICES]: setChoicesHandler,
    [Channel.SET_EDITOR_CONFIG]: setEditorConfigHandler,
    [Channel.SET_TEXTAREA_CONFIG]: setTextareaConfigHandler,
    [Channel.SET_FORM_HTML]: setFormHTMLHandler,
    [Channel.SET_HINT]: setHintHandler,
    [Channel.SET_INPUT]: setInputHandler,
    [Channel.SET_MODE]: setModeHandler,
    [Channel.SET_PANEL]: setPanelHandler,
    [Channel.SET_PLACEHOLDER]: setPlaceholderHandler,
    [Channel.SET_TAB_INDEX]: setTabIndexHandler,
    [Channel.SET_PROMPT_DATA]: setPromptDataHandler,
    [Channel.SET_MAX_HEIGHT]: setMaxHeightHandler,
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

  const [editor, setEditor] = useState<EditorRef | null>(null);

  // I hate this hack
  useEffect(() => {
    if (editor) {
      editor?.focus();

      const keyDown = editor.onKeyDown((event) => {
        if (event.ctrlKey || event.metaKey) {
          switch (event.keyCode) {
            case KeyCode.KEY_S:
              event.preventDefault();
              submit(editor.getValue());
              break;

            case KeyCode.KEY_W:
              event.preventDefault();
              closePrompt();
              break;

            default:
              break;
          }
        }
      });

      return () => {
        keyDown.dispose();
      };
    }

    return () => {};
  }, [closePrompt, submit, editor, pid]);

  return (
    <ErrorBoundary>
      <div
        ref={windowContainerRef}
        style={
          {
            WebkitAppRegion: 'drag',
            WebkitUserSelect: 'none',
          } as any
        }
        className="flex flex-col w-full rounded-lg relative h-full"
      >
        <header ref={topRef}>
          {(script?.description || script?.twitter || script?.menu) && (
            <Header script={script} pid={pid} />
          )}
          {ui === UI.hotkey && (
            <Hotkey submit={submit} onEscape={closePrompt} />
          )}
          {ui === UI.arg && (
            <Input
              onKeyDown={onKeyDown}
              placeholder={placeholder}
              ref={inputRef}
              secret={promptData?.secret}
            />
          )}
          {hint && (
            <div className="pl-3 pb-1 text-xs text-gray-800 dark:text-gray-200 italic">
              {parse(hint)}
            </div>
          )}
          {tabs?.length > 0 && (
            <Tabs tabs={tabs} tabIndex={tabIndex} onTabClick={onTabClick} />
          )}
        </header>
        <main
          ref={mainRef}
          className={`
        h-full
        border
        border-transparent
        `}
        >
          <AutoSizer>
            {({ width, height }) => (
              <>
                {ui === UI.drop && (
                  <Drop
                    placeholder={placeholder}
                    submit={submit}
                    onEscape={closePrompt}
                    width={width}
                    height={height}
                  />
                )}
                {ui === UI.textarea && (
                  <TextArea
                    ref={textAreaRef}
                    height={height}
                    width={width}
                    onSubmit={submit}
                    onEscape={closePrompt}
                  />
                )}
                {ui === UI.arg && panelHTML?.length > 0 && (
                  <Panel
                    width={width}
                    height={height}
                    onPanelHeightChanged={setMainHeight}
                  />
                )}

                {ui === UI.arg && panelHTML?.length === 0 && (
                  <List
                    ref={choicesListRef}
                    height={height}
                    width={width}
                    onListChoicesChanged={setMainHeight}
                    onIndexChange={clampIndex}
                    onIndexSubmit={onIndexSubmit}
                  />
                )}

                {ui === UI.editor && (
                  <Editor ref={setEditor} height={height} width={width} />
                )}

                {ui === UI.form && (
                  <Form
                    onSubmit={submit}
                    onEscape={closePrompt}
                    height={height}
                    width={width}
                    onFormHeightChanged={setMainHeight}
                  />
                )}
              </>
            )}
          </AutoSizer>
        </main>
      </div>
    </ErrorBoundary>
  );
}
