/* eslint-disable react/jsx-no-duplicate-props */
import React, { useEffect } from 'react';
import { motion } from 'framer-motion';
import Picker, { EmojiClickData, Theme } from 'emoji-picker-react';
import { useAtomValue, useSetAtom } from 'jotai';
import {
  boundsAtom,
  darkAtom,
  resizeCompleteAtom,
  resizingAtom,
  submitValueAtom,
} from '../jotai';
import { useObserveMainHeight } from '../hooks';

type Props = {
  width: number;
  height: number;
};
const Emoji = ({ width, height }: Props) => {
  const submit = useSetAtom(submitValueAtom);
  const isDark = useAtomValue(darkAtom);
  const resizing = useAtomValue(resizingAtom);

  useObserveMainHeight('.emoji-picker-react');

  const onEmojiClick = (emojiObject: EmojiClickData) => {
    const { getImageUrl, ...rest } = emojiObject;
    submit(rest);
  };

  // Use width and height to set the picker css variables
  // useEffect(() => {
  //   const root = document.documentElement;
  //   if (root) {
  //     const epr = document.querySelector('.epr-main') as HTMLElement;

  //     if (epr) {
  //       epr.style.setProperty(`--epr-picker-width`, `${width}px`);
  //       epr.style.setProperty(`--epr-picker-height`, `${height}px`);
  //       // set the background color to transparent
  //       epr.style.setProperty(`--epr-bg-color`, 'rgba(0,0,0,0)');
  //       epr.style.setProperty(`--epr-dark`, 'rgba(0,0,0,0)');
  //       epr.style.setProperty(
  //         `--epr-category-label-bg-color`,
  //         'rgba(0,0,0,.1)'
  //       );
  //     }
  //   }
  // }, [width, height]);

  useEffect(() => {
    if (!resizing) {
      (document.querySelector('.epr-search') as HTMLElement).focus();
    }
  }, [resizing]);

  return (
    <div
      style={{
        width: `${width}px`,
        height: `${height}px`,
      }}
      className={`bg-opacity-0 bg-transparent ${resizing ? 'hidden' : ''}`}
    >
      <Picker
        autoFocusSearch
        onEmojiClick={onEmojiClick}
        theme={isDark ? Theme.DARK : Theme.LIGHT}
      />
    </div>
  );
};

export default Emoji;
