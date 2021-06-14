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

import { useDebouncedCallback } from 'use-debounce';
import { ipcRenderer } from 'electron';
import { clamp, partition } from 'lodash';
import usePrevious from '@rooks/use-previous';
import parse from 'html-react-parser';
import { PromptData, Choice, Script } from './types';
import Tabs from './components/tabs';
import List from './components/list';
import Input from './components/input';
import Drop from './components/drop';
import Hotkey from './components/hotkey';
import TextArea from './components/textarea';
import Panel from './components/panel';
import Header from './components/header';
import { Channel, Mode, UI } from './enums';
import { highlightChoiceName } from './highlight';

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

const DEFAULT_MAX_HEIGHT = 480;

export default function App() {
  const [pid, setPid] = useState(0);
  const [script, setScript] = useState<Script>();

  const [index, setIndex] = useState<number>(0);
  const [submitted, setSubmitted] = useState<boolean>(false);
  const [promptData, setPromptData]: any = useState({});

  const [inputValue, setInputValue] = useState<string>('');
  const [ui, setUI] = useState<UI>(UI.arg);
  const [hint, setHint] = useState('');
  // const previousHint = usePrevious(hint);
  const [mode, setMode] = useState(Mode.FILTER);
  const [tabs, setTabs] = useState<string[]>([]);
  const [tabIndex, setTabIndex] = useState(0);
  const [unfilteredChoices, setUnfilteredChoices] = useState<Choice[]>([]);
  const [filteredChoices, setFilteredChoices] = useState<Choice[]>([]);
  const [placeholder, setPlaceholder] = useState('');
  // const [debouncedPlaceholder] = useDebounce(placeholder, 10);
  const previousPlaceholder: string | null = usePrevious(placeholder);
  const [panelHTML, setPanelHTML] = useState('');
  // const [scriptName, setScriptName] = useState('');
  const [maxHeight, setMaxHeight] = useState(DEFAULT_MAX_HEIGHT);
  const [listHeight, setListHeight] = useState(0);

  const choicesListRef = useRef(null);
  const choicesRef = useRef(null);
  const panelRef = useRef(null);
  const inputRef: RefObject<HTMLInputElement> = useRef(null);
  const textAreaRef: RefObject<HTMLTextAreaElement> = useRef(null);
  const windowContainerRef: RefObject<HTMLDivElement> = useRef(null);
  const topRef: RefObject<HTMLDivElement> = useRef(null);
  const [isMouseDown, setIsMouseDown] = useState(false);

  const resizeHeight = useCallback(
    (height: number) => {
      if (isMouseDown) return;

      if (!choicesRef.current) (choicesRef?.current as any)?.recalculate();
      if (!panelRef.current) (panelRef?.current as any)?.recalculate();

      const { height: topHeight } =
        topRef?.current?.getBoundingClientRect() as any;

      const hasContent =
        unfilteredChoices?.length || panelHTML?.length || textAreaRef?.current;
      const promptHeight =
        height > topHeight && hasContent ? height : topHeight;

      const newHeight = Math.round(promptHeight);

      ipcRenderer.send(Channel.CONTENT_HEIGHT_UPDATED, newHeight);
    },
    [unfilteredChoices?.length, isMouseDown, panelHTML?.length]
  );

  const onListHeightChanged = useCallback(
    (fullListHeight) => {
      const { height: topHeight } =
        topRef?.current?.getBoundingClientRect() as any;

      const fullHeight = topHeight + fullListHeight;
      const height = fullHeight < maxHeight ? fullHeight : maxHeight;

      resizeHeight(height);
      setListHeight(maxHeight - topHeight);
    },
    [maxHeight, resizeHeight]
  );

  useEffect(() => {
    const { height } = topRef?.current?.getBoundingClientRect() as any;

    setListHeight(maxHeight - height);

    if (
      (!unfilteredChoices.length || !filteredChoices.length) &&
      ui !== UI.textarea
    ) {
      resizeHeight(height);
    }
  }, [resizeHeight, unfilteredChoices, filteredChoices, maxHeight, ui]);

  // useEffect(() => {
  //   if (inputRef.current) {
  //     inputRef?.current.focus();
  //   }
  // }, [inputRef]);

  const clampIndex = useCallback(
    (i) => {
      const clampedIndex = clamp(i, 0, filteredChoices.length - 1);
      setIndex(clampedIndex);
    },
    [filteredChoices.length]
  );

  const submit = useCallback(
    (submitValue: any) => {
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
      setHint('');
    },
    [pid, promptData?.secret]
  );

  const onIndexSubmit = useCallback(
    (i) => {
      const choice = filteredChoices[i];

      submit(choice.value);
    },
    [filteredChoices, submit]
  );

  const onChange = useCallback((event) => {
    // setIndex(0);
    setInputValue(event.target.value);
  }, []);

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
    setInputValue('');
    setPanelHTML('');
    setPromptData({});
    setHint('');
  }, [pid]);

  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      if (event.key === 'Escape') {
        closePrompt();

        return;
      }

      if (event.key === 'Enter') {
        submit(filteredChoices[index].value || inputValue);
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

      // if (tabs?.length) {
      //   tabs.forEach((_tab, i) => {
      //     // cmd+2, etc.
      //     if (event.metaKey && event.key === `${i + 1}`) {
      //       event.preventDefault();
      //       setTabIndex(i);
      //       ipcRenderer.send(TAB_CHANGED, {
      //         tab: tabs[i],
      //         input: inputValue,
      //       });
      //     }
      //   });
      // }

      if (event.key === 'ArrowDown') {
        event.preventDefault();
        clampIndex(index + 1);
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        clampIndex(index - 1);
      }

      // if (choicesListRef.current) {
      //   const el = choicesListRef.current;
      //   const selectedItem: any = el.firstElementChild?.children[newIndex];
      //   const itemY = selectedItem?.offsetTop;
      //   const marginBottom = parseInt(
      //     getComputedStyle(selectedItem as any)?.marginBottom.replace('px', ''),
      //     10
      //   );
      //   if (
      //     itemY >=
      //     el.scrollTop + el.clientHeight - selectedItem.clientHeight
      //   ) {
      //     selectedItem?.scrollIntoView({ block: 'end', inline: 'nearest' });
      //     el.scrollTo({
      //       top: el.scrollTop + marginBottom,
      //     });
      //   } else if (itemY < el.scrollTop) {
      //     selectedItem?.scrollIntoView({ block: 'start', inline: 'nearest' });
      //   }
      // }
    },
    [
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
      ipcRenderer.send('PROMPT_ERROR', { error, pid: promptData?.id });
    }
  }, [
    unfilteredChoices,
    inputValue,
    mode,
    promptData?.id,
    resizeHeight,
    submitted,
  ]);

  const setPromptDataHandler = useCallback(
    (_event: any, promptData: PromptData) => {
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

  const setChoicesHandler = useCallback((_event: any, rawChoices: Choice[]) => {
    setSubmitted(false);
    setPanelHTML('');
    setUnfilteredChoices(rawChoices);
  }, []);

  const resetPromptHandler = useCallback(() => {
    setIsMouseDown(false);
    setPlaceholder('');

    setFilteredChoices([]);
    setHint('');
    setInputValue('');
    setPanelHTML('');
    setPromptData({});
    setTabs([]);
    setUnfilteredChoices([]);
  }, []);

  const setPidHandler = useCallback((_event, pid: number) => {
    setPid(pid);
  }, []);

  const setScriptHandler = useCallback((_event, script: Script) => {
    // resetPromptHandler();
    setSubmitted(false);
    setScript(script);
    setUI(script.ui);
    setPlaceholder(script.placeholder);
    setTabs(script.tabs || []);
    setTabIndex(0);
    setInputValue('');
  }, []);

  const userResizedHandler = useCallback((event, data) => {
    setIsMouseDown(!!data);
    setMaxHeight(window.innerHeight);
  }, []);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const messageMap = {
    // [Channel.RESET_PROMPT]: resetPromptHandler,
    [Channel.SET_PID]: setPidHandler,
    [Channel.SET_SCRIPT]: setScriptHandler,
    [Channel.SET_CHOICES]: setChoicesHandler,
    [Channel.SET_HINT]: setHintHandler,
    [Channel.SET_INPUT]: setInputHandler,
    [Channel.SET_MODE]: setModeHandler,
    [Channel.SET_PANEL]: setPanelHandler,
    [Channel.SET_PLACEHOLDER]: setPlaceholderHandler,
    [Channel.SET_TAB_INDEX]: setTabIndexHandler,
    [Channel.SET_PROMPT_DATA]: setPromptDataHandler,
    [Channel.USER_RESIZED]: userResizedHandler,
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

  return (
    <ErrorBoundary>
      <div
        ref={windowContainerRef}
        style={
          {
            WebkitAppRegion: 'drag',
            WebkitUserSelect: 'none',
            maxHeight,
          } as any
        }
        className="flex flex-col w-full rounded-lg relative h-full"
      >
        <div ref={topRef}>
          {(script?.description || script?.twitter || script?.menu) && (
            <Header script={script} pid={pid} />
          )}
          {ui === UI.hotkey && <Hotkey submit={submit} />}
          {ui === UI.drop && <Drop placeholder={placeholder} submit={submit} />}
          {ui === UI.arg && (
            <Input
              onKeyDown={onKeyDown}
              onChange={onChange}
              placeholder={placeholder}
              ref={inputRef}
              secret={promptData?.secret}
              value={inputValue}
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
        </div>
        {ui === UI.textarea && (
          <TextArea
            ref={textAreaRef}
            height={maxHeight}
            onSubmit={submit}
            onEscape={closePrompt}
            placeholder={placeholder}
          />
        )}
        {panelHTML?.length > 0 && (
          <Panel ref={panelRef} panelHTML={panelHTML} />
        )}

        {ui === UI.arg && filteredChoices?.length > 0 && (
          <List
            ref={choicesListRef}
            listHeight={listHeight}
            choices={filteredChoices}
            onListHeightChanged={onListHeightChanged}
            index={index}
            onIndexChange={clampIndex}
            onIndexSubmit={onIndexSubmit}
          />
        )}
      </div>
    </ErrorBoundary>
  );
}
