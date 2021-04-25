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
import { useDebounce, useDebouncedCallback } from 'use-debounce';
import { ipcRenderer } from 'electron';
import SimpleBar from 'simplebar-react';
import { partition } from 'lodash';
import usePrevious from '@rooks/use-previous';
import useResizeObserver from '@react-hook/resize-observer';
import parse from 'html-react-parser';
import { KitPromptOptions, ChoiceData } from './types';
import {
  CHOICE_FOCUSED,
  GENERATE_CHOICES,
  ESCAPE_PRESSED,
  RESET_PROMPT,
  RUN_SCRIPT,
  SET_CHOICES,
  SET_HINT,
  SET_INPUT,
  SET_MODE,
  SET_PANEL,
  SET_PLACEHOLDER,
  SET_TAB_INDEX,
  SHOW_PROMPT,
  TAB_CHANGED,
  VALUE_SUBMITTED,
  CONTENT_SIZE_UPDATED,
  USER_RESIZED,
} from './channels';
import Tabs from './components/tabs';
import ChoiceButton from './components/button';
import Preview from './components/preview';
import Panel from './components/panel';
import Header from './components/header';
import { MODE } from './enums';

const generateShortcut = ({
  option,
  command,
  shift,
  superKey,
  control,
}: any) => {
  return `${command ? `command ` : ``}${shift ? `shift ` : ``}${
    option ? `option ` : ``
  }${control ? `control ` : ``}${superKey ? `super ` : ``}`;
};

const keyFromCode = (code: string) => {
  const keyCode = code.replace(/Key|Digit/, '').toLowerCase();
  const replaceAlts = (k: string) => {
    const map: any = {
      backslash: '\\',
      slash: '/',
      quote: `'`,
      backquote: '`',
      equal: `=`,
      minus: `-`,
      period: `.`,
      comma: `,`,
      bracketleft: `[`,
      bracketright: `]`,
      space: 'space',
      semicolon: ';',
    };

    if (map[k]) return map[k];

    return k;
  };

  return replaceAlts(keyCode);
};
class ErrorBoundary extends React.Component {
  // eslint-disable-next-line react/state-in-constructor
  public state: { hasError: boolean } = { hasError: false };

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Display fallback UI
    this.setState({ hasError: true });
    // You can also log the error to an error reporting service
    ipcRenderer.send('PROMPT_ERROR', error);
  }

  render() {
    // eslint-disable-next-line react/destructuring-assignment
    if (this.state.hasError) {
      // You can render any custom fallback UI
      return <h1>Something went wrong.</h1>;
    }
    // eslint-disable-next-line react/destructuring-assignment
    return this.props.children;
  }
}

export default function App() {
  const [promptData, setPromptData]: any = useState({});

  const [inputValue, setInputValue] = useState('');
  const [hint, setHint] = useState('');
  const previousHint = usePrevious(hint);
  const [mode, setMode] = useState(MODE.FILTER);
  const [index, setIndex] = useState(0);
  const [tabs, setTabs] = useState([]);
  const [tabIndex, setTabIndex] = useState(0);
  const [unfilteredChoices, setUnfilteredChoices] = useState<ChoiceData[]>([]);
  const [choices, setChoices] = useState<ChoiceData[]>([]);
  const [placeholder, setPlaceholder] = useState('');
  const [debouncedPlaceholder] = useDebounce(placeholder, 10);
  const previousPlaceholder: string | null = usePrevious(placeholder);
  const [dropReady, setDropReady] = useState(false);
  const [panelHTML, setPanelHTML] = useState('');
  const [scriptName, setScriptName] = useState('');
  const [maxHeight, setMaxHeight] = useState(480);
  const prevMaxHeight = usePrevious(maxHeight);
  const [caretDisabled, setCaretDisabled] = useState(false);
  const choicesSimpleBarRef = useRef(null);
  const choicesRef = useRef(null);
  const panelRef = useRef(null);
  const inputRef: RefObject<HTMLInputElement> = useRef(null);
  const windowContainerRef: RefObject<HTMLDivElement> = useRef(null);
  const topRef: RefObject<HTMLDivElement> = useRef(null);
  const [isMouseDown, setIsMouseDown] = useState(false);
  const [hotkey, setHotkey] = useState({});

  const sendResize = useDebouncedCallback(
    useCallback(
      (width: number, height: number) => {
        if (isMouseDown) return;
        const {
          height: topHeight,
        } = topRef?.current?.getBoundingClientRect() as any;

        if (!choicesRef.current) (choicesRef?.current as any)?.recalculate();
        if (!panelRef.current) (panelRef?.current as any)?.recalculate();

        const hasContent = choices?.length || panelHTML?.length;
        if (height > topHeight && hasContent) {
          ipcRenderer.send(CONTENT_SIZE_UPDATED, {
            width: Math.round(width),
            height: Math.round(height),
          });
        } else {
          ipcRenderer.send(CONTENT_SIZE_UPDATED, {
            width: Math.round(width),
            height: Math.round(topHeight),
          });
        }
      },
      [choices?.length, isMouseDown, panelHTML?.length]
    ),
    25
  );

  useResizeObserver(windowContainerRef, (entry) => {
    const { width, height } = entry.contentRect;
    sendResize(width, height);
  });

  useEffect(() => {
    if (inputRef.current) {
      inputRef?.current.focus();
    }
  }, [inputRef]);

  useEffect(() => {
    setTabs(promptData?.tabs || []);
  }, [promptData?.tabs]);

  useEffect(() => {
    setIndex(0);
  }, [unfilteredChoices]);

  const submit = useCallback((value: any) => {
    if (mode !== MODE.HOTKEY)
      setPlaceholder(typeof value === 'string' ? value : 'Processing...');
    setUnfilteredChoices([]);
    setPanelHTML('');
    setInputValue('');

    if (Array.isArray(value)) {
      const files = value.map((file) => {
        const fileObject: any = {};

        for (const key in file) {
          const value = file[key];
          const notFunction = typeof value !== 'function';
          if (notFunction) fileObject[key] = value;
        }

        return fileObject;
      });

      ipcRenderer.send(VALUE_SUBMITTED, { value: files });
      return;
    }

    ipcRenderer.send(VALUE_SUBMITTED, { value });
  }, []);

  useEffect(() => {
    if (index > choices?.length - 1) setIndex(choices?.length - 1);
    if (choices?.length && index <= 0) setIndex(0);
  }, [choices?.length, index]);

  const onChange = useCallback((value) => {
    setIndex(0);
    if (typeof value === 'string') {
      setInputValue(value);
    }
  }, []);

  const onDragEnter = useCallback((event) => {
    event.preventDefault();
    setDropReady(true);
    setPlaceholder('Drop to submit');
  }, []);
  const onDragLeave = useCallback((event) => {
    setDropReady(false);
    setPlaceholder(previousPlaceholder || '');
  }, []);
  const onDrop = useCallback(
    (event) => {
      setDropReady(false);
      const files = Array.from(event?.dataTransfer?.files);
      if (files?.length > 0) {
        submit(files);
        return;
      }

      const data =
        event?.dataTransfer?.getData('URL') ||
        event?.dataTransfer?.getData('Text') ||
        null;
      if (data) {
        submit(data);
        return;
      }
      if (event.target.value) {
        submit(event.target.value);
        return;
      }

      setTimeout(() => {
        submit(event.target.value);
      }, 100);
    },
    [submit]
  );

  useEffect(() => {
    if (choices?.length > 0 && choices?.[index]) {
      ipcRenderer.send(CHOICE_FOCUSED, choices[index]);
    }
    if (choices?.length === 0) {
      ipcRenderer.send(CHOICE_FOCUSED, null);
    }
  }, [choices, index]);

  const onTabClick = useCallback(
    (ti: number) => (_event: any) => {
      setTabIndex(ti);
      ipcRenderer.send(TAB_CHANGED, { tab: tabs[ti], input: inputValue });
    },
    [inputValue, tabs]
  );

  const closePrompt = useCallback(() => {
    setChoices([]);
    setInputValue('');
    setPanelHTML('');
    setPromptData({});
    ipcRenderer.send(ESCAPE_PRESSED, {});
  }, []);

  const onKeyUp = useCallback(
    (event) => {
      if (event.key === 'Escape') {
        closePrompt();
        return;
      }

      if (mode === MODE.HOTKEY) {
        event.preventDefault();
        const {
          code,
          metaKey: command,
          shiftKey: shift,
          ctrlKey: control,
          altKey: option,
        } = event as any;
        const superKey = event.getModifierState('Super');
        const shortcut = generateShortcut({
          code,
          command,
          shift,
          control,
          option,
          superKey,
        });
        setPlaceholder(shortcut);
      }
    },
    [mode]
  );

  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      if (event.key === 'Escape') {
        return;
      }

      if (mode === MODE.HOTKEY) {
        const {
          key,
          code,
          metaKey: command,
          shiftKey: shift,
          ctrlKey: control,
          altKey: option,
        } = event as any;
        const superKey = event.getModifierState('Super');
        const shortcut = generateShortcut({
          command,
          shift,
          control,
          option,
          superKey,
        });

        const normalKey = option ? keyFromCode(code) : key;

        const eventKeyData = {
          key: normalKey,
          command,
          shift,
          option,
          control,
          fn: event.getModifierState('Fn'),
          // fnLock: event.getModifierState('FnLock'),
          // numLock: event.getModifierState('NumLock'),
          hyper: event.getModifierState('Hyper'),
          os: event.getModifierState('OS'),
          super: superKey,
          win: event.getModifierState('Win'),
          // scrollLock: event.getModifierState('ScrollLock'),
          // scroll: event.getModifierState('Scroll'),
          // capsLock: event.getModifierState('CapsLock'),
          shortcut: `${shortcut}${normalKey}`,
        };

        setHotkey(eventKeyData);
        setPlaceholder(shortcut);

        if (
          event.key.length === 1 ||
          ['Shift', 'Control', 'Alt', 'Meta'].every(
            (m) => !event.key.includes(m)
          )
        ) {
          submit(eventKeyData);
        }
        event.preventDefault();
        return;
      }

      if (event.key === 'Enter') {
        submit(choices?.[index]?.value || inputValue);
        return;
      }

      if (event.key === ' ') {
        const shortcodeChoice = choices?.find(
          (choice) => choice?.shortcode === inputValue.trim()
        );
        if (shortcodeChoice) {
          submit(shortcodeChoice.value);
          return;
        }
      }

      if (event.key === 'Tab') {
        event.preventDefault();
        if (tabs?.length) {
          const clamp = tabs.length;
          const clampIndex = (tabIndex + (event.shiftKey ? -1 : 1)) % clamp;
          const nextIndex = clampIndex < 0 ? clamp - 1 : clampIndex;
          setTabIndex(nextIndex);
          ipcRenderer.send(TAB_CHANGED, {
            tab: tabs[nextIndex],
            input: inputValue,
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

      let newIndex = index;

      if (event.key === 'ArrowDown') {
        event.preventDefault();
        newIndex += 1;
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        newIndex -= 1;
      }

      if (newIndex < 0) newIndex = 0;
      if (newIndex > choices?.length - 1) newIndex = choices?.length - 1;

      setIndex(newIndex);

      if (choicesSimpleBarRef.current) {
        const el = choicesSimpleBarRef.current;
        const selectedItem: any = el.firstElementChild?.children[newIndex];
        const itemY = selectedItem?.offsetTop;
        const marginBottom = parseInt(
          getComputedStyle(selectedItem as any)?.marginBottom.replace('px', ''),
          10
        );
        if (
          itemY >=
          el.scrollTop + el.clientHeight - selectedItem.clientHeight
        ) {
          selectedItem?.scrollIntoView({ block: 'end', inline: 'nearest' });
          el.scrollTo({
            top: el.scrollTop + marginBottom,
          });
        } else if (itemY < el.scrollTop) {
          selectedItem?.scrollIntoView({ block: 'start', inline: 'nearest' });
        }
      }
    },
    [
      index,
      choices,
      setPromptData,
      submit,
      inputValue,
      tabs,
      tabIndex,
      mode,
      hotkey,
    ]
  );

  const generateChoices = useDebouncedCallback((value, mode, tab) => {
    if (mode === MODE.GENERATE) {
      ipcRenderer.send(GENERATE_CHOICES, value);
    }
  }, 150);

  useEffect(() => {
    generateChoices(inputValue, mode, tabIndex);
  }, [mode, inputValue, tabIndex]);

  useEffect(() => {
    setCaretDisabled(Boolean(!promptData?.placeholder));
  }, [promptData?.placeholder]);

  useEffect(() => {
    try {
      if (mode === (MODE.GENERATE || MODE.MANUAL)) {
        setChoices(unfilteredChoices);
        return;
      }
      if (!unfilteredChoices?.length) {
        setChoices([]);
        return;
      }

      const input = inputValue?.toLowerCase() || '';

      const startExactFilter = (choice: any) =>
        choice.name?.toLowerCase().startsWith(input);

      const startEachWordFilter = (choice: any) => {
        let wordIndex = 0;
        let wordLetterIndex = 0;
        const words = choice.name?.toLowerCase().match(/\w+\W*/g);
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

      setChoices(filtered);
    } catch (error) {
      ipcRenderer.send('PROMPT_ERROR', error);
    }
  }, [unfilteredChoices, inputValue, mode]);

  const showPromptHandler = useCallback(
    (_event: any, promptData: KitPromptOptions) => {
      setPlaceholder('');
      setPanelHTML('');
      setPromptData(promptData);
      if (inputRef.current) {
        inputRef?.current.focus();
      }
    },
    []
  );

  const setTabIndexHandler = useCallback(
    (_event: any, { tabIndex: ti }: any) => {
      setPanelHTML('');
      setTabIndex(ti);
    },
    []
  );

  const setPlaceholderHandler = useCallback((_event: any, { text }: any) => {
    setPlaceholder(text);
  }, []);

  const setPanelHandler = useCallback((_event: any, { html }: any) => {
    setPanelHTML(html);
    setChoices([]);
  }, []);

  const setModeHandler = useCallback((_event: any, { mode }: any) => {
    setMode(mode);
  }, []);

  const setHintHandler = useCallback((_event: any, { hint }: any) => {
    setHint(hint);
  }, []);

  const setInputHandler = useCallback((_event: any, { input }: any) => {
    setInputValue(input);
  }, []);

  const setChoicesHandler = useCallback((_event: any, { choices }: any) => {
    setPanelHTML('');
    setUnfilteredChoices(choices);
  }, []);

  const resetPromptHandler = useCallback((event, data) => {
    setIsMouseDown(false);
    setPlaceholder('');
    setDropReady(false);
    setChoices([]);
    setHint('');
    setInputValue('');
    setPanelHTML('');
    setPromptData({});
    setTabs([]);
    setUnfilteredChoices([]);
  }, []);

  const userResizedHandler = useCallback((event, data) => {
    setIsMouseDown(!!data);
    setMaxHeight(window.innerHeight);
  }, []);

  const messageMap = {
    [RESET_PROMPT]: resetPromptHandler,
    [RUN_SCRIPT]: resetPromptHandler,
    [SET_CHOICES]: setChoicesHandler,
    [SET_HINT]: setHintHandler,
    [SET_INPUT]: setInputHandler,
    [SET_MODE]: setModeHandler,
    [SET_PANEL]: setPanelHandler,
    [SET_PLACEHOLDER]: setPlaceholderHandler,
    [SET_TAB_INDEX]: setTabIndexHandler,
    [SHOW_PROMPT]: showPromptHandler,
    [USER_RESIZED]: userResizedHandler,
  };

  useEffect(() => {
    Object.entries(messageMap).forEach(([key, value]: any) => {
      if (ipcRenderer.listenerCount(key) === 0) {
        ipcRenderer.on(key, (event, data) => {
          if (data?.kitScript) setScriptName(data?.kitScript);
          value(event, data);
        });
      }
    });

    return () => {
      Object.entries(messageMap).forEach(([key, value]: any) => {
        ipcRenderer.off(key, value);
      });
    };
  }, []);

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
          {(promptData?.scriptInfo?.description ||
            promptData?.scriptInfo?.twitter ||
            promptData?.scriptInfo?.menu) && (
            <Header scriptInfo={promptData?.scriptInfo} />
          )}
          <input
            style={
              {
                WebkitAppRegion: 'drag',
                WebkitUserSelect: 'none',
                minHeight: '4rem',
                ...(caretDisabled && { caretColor: 'transparent' }),
              } as any
            }
            autoFocus
            className={`bg-transparent w-full text-black dark:text-white focus:outline-none outline-none text-xl dark:placeholder-white dark:placeholder-opacity-40 placeholder-black placeholder-opacity-40 h-16
            ring-0 ring-opacity-0 focus:ring-0 focus:ring-opacity-0 pl-4 py-0

            ${
              promptData?.drop
                ? `
            border-dashed border-4 rounded border-gray-500 focus:border-gray-500 text-opacity-50 ${
              dropReady &&
              `border-yellow-500 text-opacity-90 focus:border-yellow-500`
            }`
                : `            focus:border-none border-none`
            }
          `}
            onChange={
              mode !== MODE.HOTKEY
                ? (e) => {
                    onChange(e.target.value);
                  }
                : undefined
            }
            onKeyDown={onKeyDown}
            onKeyUp={onKeyUp}
            placeholder={debouncedPlaceholder || promptData?.placeholder}
            ref={inputRef}
            type={promptData?.secret ? 'password' : 'text'}
            value={mode !== MODE.HOTKEY ? inputValue : undefined}
            onDragEnter={promptData?.drop ? onDragEnter : undefined}
            onDragLeave={promptData?.drop ? onDragLeave : undefined}
            onDrop={promptData?.drop ? onDrop : undefined}
          />
          {hint && (
            <div className="pl-3 pb-1 text-xs text-gray-800 dark:text-gray-200 italic">
              {parse(hint)}
            </div>
          )}
          {tabs?.length > 0 && (
            <Tabs tabs={tabs} tabIndex={tabIndex} onTabClick={onTabClick} />
          )}
        </div>
        {panelHTML?.length > 0 && (
          <Panel ref={panelRef} panelHTML={panelHTML} />
        )}

        {choices?.length > 0 && (
          <div
            className="flex flex-row w-full max-h-full overflow-y-hidden border-t dark:border-white dark:border-opacity-5 border-black border-opacity-5"
            style={
              {
                WebkitAppRegion: 'no-drag',
                WebkitUserSelect: 'none',
              } as any
            }
          >
            <SimpleBar
              ref={choicesRef}
              scrollableNodeProps={{ ref: choicesSimpleBarRef }}
              className="px-0 flex flex-col text-black dark:text-white max-h-full overflow-y-scroll focus:border-none focus:outline-none outline-none flex-1 bg-opacity-20"
            >
              {((choices as any[]) || []).map((choice, i) => (
                <ChoiceButton
                  key={choice.id}
                  choice={choice}
                  i={i}
                  submit={submit}
                  mode={mode}
                  index={index}
                  inputValue={inputValue}
                  setIndex={setIndex}
                />
              ))}
            </SimpleBar>
            {choices?.[index]?.preview && (
              <Preview preview={choices?.[index]?.preview || ''} />
            )}
          </div>
        )}
      </div>
    </ErrorBoundary>
  );
}
