/* eslint-disable react/jsx-props-no-spreading */
import { useAtomValue, useAtom } from 'jotai';
import { loadable } from 'jotai/utils';
import { motion } from 'framer-motion';
import { Channel, UI } from '@johnlindquist/kit/cjs/enum';
import React, { useCallback } from 'react';
import {
  flagsAtom,
  _flag,
  _choices,
  inputAtom,
  _index,
  channelAtom,
  flagValueAtom,
  footerAtom,
  shortcutsAtom,
  uiAtom,
  sendShortcutAtom,
  focusedChoiceAtom,
  enterButtonNameAtom,
  enterButtonDisabledAtom,
  createAssetAtom,
} from '../jotai';

type Action = {
  name: string;
  shortcut: string;
  position: 'left' | 'right';
  key: string;
  value: string;
  flag: string;
  disabled: boolean;
  arrow?: string;
};

const transition = { duration: 0.2, ease: 'easeInOut' };

export function OptionsButton() {
  const [choices] = useAtom(_choices);
  const [input] = useAtom(inputAtom);
  const [index] = useAtom(_index);
  const [channel] = useAtom(channelAtom);
  const [flagValue, setFlagValue] = useAtom(flagValueAtom);
  const [ui] = useAtom(uiAtom);

  const onClick = useCallback(() => {
    if (flagValue) {
      setFlagValue('');
      channel(Channel.FORWARD);
    } else {
      setFlagValue(choices.length ? choices[index].value : input);
      channel(Channel.BACK);
    }
  }, [choices, input, index, channel, flagValue, setFlagValue]);

  return (
    <motion.button
      type="button"
      tabIndex={-1}
      initial={{ opacity: 0 }}
      animate={{ opacity: [0, 1] }}
      transition={transition}
      className="
  flex flex-row items-center justify-center
  outline-none px-1 py-1
  font-medium focus:text-primary-dark dark:focus:text-primary-light
  hover:text-primary-dark dark:hover:text-primary-light
  text-sm
  text-black dark:text-white text-opacity-50 dark:text-opacity-50
  rounded
  bg-black dark:bg-white dark:bg-opacity-0 bg-opacity-0
  hover:bg-opacity-10 dark:hover:bg-opacity-10
  transition-all duration-200 ease-in-out
  "
      onClick={onClick}
    >
      <div className="px-1">{flagValue ? 'Back' : 'Options'}</div>
      <div className=" flex flex-row">
        <div
          className="
          py-.5 px-1 mx-0.5

          rounded
          bg-black dark:bg-white dark:bg-opacity-10 bg-opacity-10
          hover:border-opacity-10 dark:hover:border-opacity-10

          "
        >
          {flagValue ? '←' : '→'}
        </div>
      </div>
    </motion.button>
  );
}

export function ActionSeparator() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: [0, 1] }}
      transition={transition}
      className="
      flex items-center justify-center
      font-mono
      leading-none
      text-sm font-medium
      text-black dark:text-white text-opacity-10 dark:text-opacity-25
      p-0.5
      text-center
"
    >
      |
    </motion.div>
  );
}

export const formatShortcut = (shortcut: string) => {
  return shortcut
    .replace('cmd', '⌘')
    .replace('ctrl', '⌃')
    .replace('shift', '⇧')
    .replace('alt', '⌥')
    .replace('enter', '⏎')
    .replace('return', '⏎')
    .replace('escape', '⎋')
    .replace('up', '↑')
    .replace('down', '↓')
    .replace('left', '←')
    .replace('right', '→')
    .replace('delete', '⌫')
    .replace('backspace', '⌫')

    .toUpperCase();
};

export function ActionButton(action: Action) {
  const [choices] = useAtom(_choices);
  const [input] = useAtom(inputAtom);
  const [index] = useAtom(_index);
  const [ui] = useAtom(uiAtom);
  const [, sendShortcut] = useAtom(sendShortcutAtom);
  const [, setFlag] = useAtom(_flag);

  const onClick = useCallback(
    (event) => {
      if (ui === UI.form) {
        event.preventDefault();

        const el = document.querySelector(
          `[name="${action.name.toLowerCase()}"]`
        ) as HTMLInputElement;

        if (el) {
          el.click();
        }
      } else {
        console.log(action);
        if (action?.flag) setFlag(action.flag);
        sendShortcut(action.value);
      }
    },
    [action, choices, input, index, ui, setFlag]
  );

  return (
    <motion.button
      type="button"
      initial={{ opacity: 0 }}
      animate={{ opacity: [0, 1] }}
      transition={transition}
      disabled={action?.disabled}
      tabIndex={action?.value === 'enter' ? 0 : -1}
      className={`
  flex flex-row items-center justify-center
  outline-none
  p-1
  font-medium focus:text-primary-dark dark:focus:text-primary-light

  text-sm
  text-black dark:text-white text-opacity-50 dark:text-opacity-50
  rounded
  bg-black dark:bg-white dark:bg-opacity-0 bg-opacity-0
  h-full
  ${
    action?.disabled
      ? `brightness-50`
      : `
  brightness-100
  hover:bg-opacity-10 dark:hover:bg-opacity-10
  hover:text-primary-dark dark:hover:text-primary-light
  transition-all duration-200 ease-in-out
  `
  }
  `}
      onClick={onClick}
    >
      <div className="px-1 truncate min-w-0">{action.name}</div>
      <div className=" flex flex-row">
        {action.shortcut.split('+').map((k) => {
          return (
            <div
              key={k}
              className="
              flex items-center justify-center
          w-5 h-5 ml-1
          leading-none

          rounded
          bg-black dark:bg-white dark:bg-opacity-10 bg-opacity-10
          hover:border-opacity-10 dark:hover:border-opacity-10
          "
            >
              {k}
            </div>
          );
        })}
      </div>
    </motion.button>
  );
}

const loadableIconAtom = loadable(createAssetAtom('svg', 'logo.svg'));

const IconButton = () => {
  const [lazyIcon] = useAtom(loadableIconAtom);
  if (lazyIcon.state === 'hasError') return <span>{lazyIcon.error}</span>;
  if (lazyIcon.state === 'loading') {
    return <span>Loading...</span>;
  }

  return (
    <motion.button
      key="icon-button"
      tabIndex={-1}
      type="button"
      initial={{ opacity: 0 }}
      animate={{ opacity: [0, 1] }}
      transition={transition}
      className="min-w-fit min-h-fit"
    >
      <a href="https://scriptkit.com" tabIndex={-1}>
        <svg
          className="
        flex
      h-6 w-6 opacity-50 dark:opacity-50
      hover:opacity-75 dark:hover:opacity-75
      items-center justify-center
      p-1
      -ml-1
      rounded
      min-w-fit
      text-black dark:text-white
      hover:text-primary-dark hover:dark:text-primary-light
      transition-all duration-200 ease-in-out
      "
          xmlns="http://www.w3.org/2000/svg"
          width="32"
          height="32"
          fill="currentColor"
          viewBox="0 0 32 32"
        >
          <path
            fill="currentColor"
            d="M14 25a2 2 0 0 1 2-2h14a2 2 0 1 1 0 4H16a2 2 0 0 1-2-2ZM0 7.381c0-1.796 1.983-2.884 3.498-1.92l13.728 8.736c1.406.895 1.406 2.946 0 3.84L3.498 26.775C1.983 27.738 0 26.649 0 24.854V7.38Z"
          />
        </svg>
      </a>
    </motion.button>
  );
};

export default function ActionBar() {
  const [flags] = useAtom(flagsAtom);
  const [footer] = useAtom(footerAtom);
  const [shortcuts] = useAtom(shortcutsAtom);

  const [enterButtonName] = useAtom(enterButtonNameAtom);
  const [disabled] = useAtom(flagValueAtom);
  const [enterButtonDisabled] = useAtom(enterButtonDisabledAtom);
  const [ui] = useAtom(uiAtom);

  const actions: Action[] = Object.entries(flags)
    .filter(([_, flag]) => {
      return flag?.bar && flag?.shortcut;
    })
    .map(([key, flag]) => {
      const action = {
        key,
        value: key,
        name: flag?.name,
        shortcut: formatShortcut(flag?.shortcut),
        position: flag.bar,
        arrow: (flag as Action)?.arrow,
        flag: key,
        disabled: Boolean(disabled),
      } as Action;

      return action;
    })
    .concat(
      shortcuts
        .filter((s) => s?.bar)
        .map(({ key, name, bar, flag }) => {
          return {
            key,
            name,
            value: key,
            shortcut: formatShortcut(key),
            position: bar,
            flag,
            disabled: Boolean(disabled),
          } as Action;
        })
    );

  const hasFlags = Object.keys(flags)?.length > 0;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: [0, 1] }}
      transition={transition}
      className={`
      flex flex-row border-t
    dark:border-white dark:border-opacity-5
    border-black border-opacity-5
    bg-white dark:bg-black
    ${
      ui === UI.splash
        ? `
    bg-opacity-0 dark:bg-opacity-0
    `
        : `
    bg-opacity-25 dark:bg-opacity-25
    `
    }

    py-2 px-4
    items-center overflow-hidden
    h-10 max-h-10`}
    >
      <IconButton />

      <div className="left-container flex flex-row">
        {actions
          .filter((action) => action.position === 'left')
          .flatMap((action, i, array) => [
            // eslint-disable-next-line react/jsx-key
            <ActionButton {...action} />,
            i < array.length - 1 ? (
              <ActionSeparator key={`${action?.key}-separator`} />
            ) : null,
            i === array.length - 1 && footer?.length ? (
              <ActionSeparator key={`${action?.key}-separator`} />
            ) : null,
          ])}
      </div>
      {footer?.length ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 1] }}
          transition={transition}
          className="flex flex-1 max-h-full
        px-2 py-1
        items-center justify-left
text-sm font-medium
text-black dark:text-white
text-opacity-75 dark:text-opacity-75
truncate
      "
        >
          <div
            className="truncate min-w-0"
            dangerouslySetInnerHTML={{ __html: footer }}
          />
        </motion.div>
      ) : (
        <div className="flex-1 max-h-full" />
      )}

      <div className="right-container flex flex-row items-center h-full overflow-hidden">
        <div className="options-container flex flex-row">
          {hasFlags && [
            <OptionsButton key="options-button" />,
            <ActionSeparator key="options-separator" />,
          ]}
        </div>
        <div className="flex flex-row flex-grow-0 items-center overflow-hidden">
          {actions
            .filter((action) => action.position === 'right')
            .flatMap((action, i, array) => [
              // eslint-disable-next-line react/jsx-key
              <ActionButton {...action} />,
              // eslint-disable-next-line no-nested-ternary
              i < array.length - 1 ? (
                <ActionSeparator key={`${action?.key}-separator`} />
              ) : enterButtonName ? (
                <ActionSeparator key={`${action?.key}-separator`} />
              ) : null,
            ])}
        </div>
        <div className="enter-container flex flex-row min-w-fit items-center">
          {enterButtonName ? (
            <ActionButton
              key="enter-button"
              name={enterButtonName}
              position="right"
              shortcut="⏎"
              value="enter"
              flag=""
              disabled={enterButtonDisabled}
            />
          ) : null}
        </div>
      </div>
    </motion.div>
  );
}
