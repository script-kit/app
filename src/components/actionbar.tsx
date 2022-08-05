/* eslint-disable react/jsx-props-no-spreading */
import { useAtomValue, useAtom } from 'jotai';
import { motion } from 'framer-motion';
import { Channel } from '@johnlindquist/kit/cjs/enum';
import React, { useCallback } from 'react';
import {
  getAssetAtom,
  flagsAtom,
  submitValueAtom,
  _flag,
  _choices,
  inputAtom,
  _index,
  channelAtom,
  flagValueAtom,
} from '../jotai';

type Action = {
  name: string;
  shortcut: string;
  position: 'left' | 'right';
  key: string;
  value: string;
};

const transition = { duration: 0.2, ease: 'easeInOut' };

export function MenuButton() {
  const [choices] = useAtom(_choices);
  const [input] = useAtom(inputAtom);
  const [index] = useAtom(_index);
  const [channel] = useAtom(channelAtom);
  const [flagValue, setFlagValue] = useAtom(flagValueAtom);

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
  "
      onClick={onClick}
    >
      <div className="px-1.5">{flagValue ? 'Back' : 'Menu'}</div>
      <div className=" flex flex-row">
        <div
          className="
          py-.5 px-1.5 mx-0.5

          rounded
          bg-black dark:bg-white dark:bg-opacity-10 bg-opacity-10
          hover:border-opacity-10 dark:hover:border-opacity-10
          transition-all duration-200 ease-in-out
          "
        >
          {flagValue ? '←' : '→'}
        </div>
      </div>
    </motion.button>
  );
}

export function ActionButton(action: Action) {
  const [, setFlag] = useAtom(_flag);
  const [, submit] = useAtom(submitValueAtom);
  const [choices] = useAtom(_choices);
  const [input] = useAtom(inputAtom);
  const [index] = useAtom(_index);

  const onClick = useCallback(() => {
    setFlag(action.value);
    submit(choices.length ? choices[index].value : input);
  }, [action, setFlag, submit, choices, input, index]);

  return (
    <motion.button
      type="button"
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
  "
      onClick={onClick}
    >
      <div className="px-1.5">{action.name}</div>
      <div className=" flex flex-row">
        {action.shortcut.split('+').map((k) => {
          return (
            <div
              key={k}
              className="
          py-.5 px-1.5 mx-0.5

          rounded
          bg-black dark:bg-white dark:bg-opacity-10 bg-opacity-10
          hover:border-opacity-10 dark:hover:border-opacity-10
          transition-all duration-200 ease-in-out
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

export default function ActionBar() {
  const getAsset = useAtomValue(getAssetAtom);
  const [flags] = useAtom(flagsAtom);

  const actions: Action[] = Object.entries(flags)
    .filter(([_, flag]) => {
      return flag?.action && (flag?.shortcut || flag?.arrow);
    })
    .map(([key, flag]) => {
      const action = {
        key,
        value: key,
        name: flag?.name,
        shortcut: ((flag?.shortcut || flag?.arrow) as string)
          .replace('cmd', '⌘')
          .replace('ctrl', '⌃')
          .replace('shift', '⇧')
          .replace('alt', '⌥')
          .replace('enter', '⏎')
          .replace('return', '⏎')

          .toUpperCase(),
        position: flag.action,
        arrow: flag?.arrow,
      } as Action;

      return action;
    });

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: [0, 1] }}
      transition={transition}
      className="flex flex-row border-t
    dark:border-white dark:border-opacity-5
    border-black border-opacity-5
    py-2 px-4
    items-center
    h-10
    "
    >
      <button type="button">
        <img
          src={getAsset('tray/default-Template@2x.png')}
          alt="Jotai"
          className="
        h-4 opacity-50 dark:opacity-50 invert dark:invert-0
        hover:opacity-75 dark:hover:opacity-75
        "
        />
      </button>

      {actions
        .filter((action) => action.position === 'left')
        .map((action) => (
          // eslint-disable-next-line react/jsx-key
          <ActionButton {...action} />
        ))}
      <div className="flex-1" />
      {Object.keys(flags)?.length > 0 && <MenuButton />}
      {actions
        .filter((action) => action.position === 'right')
        .map((action) => (
          // eslint-disable-next-line react/jsx-key
          <ActionButton {...action} />
        ))}
    </motion.div>
  );
}
