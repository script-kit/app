/* eslint-disable react/jsx-no-duplicate-props */
import React, { useEffect } from 'react';
import Picker, { EmojiClickData, EmojiStyle, Theme } from 'emoji-picker-react';
import { motion } from 'framer-motion';
import { useAtomValue, useSetAtom } from 'jotai';
import { darkAtom, resizingAtom, submitValueAtom } from '../jotai';
import { useObserveMainHeight } from '../hooks';

const Emoji = () => {
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
    (document.querySelector('.epr-search') as HTMLElement).focus();
  }, []);

  return (
    <motion.div className="w-full h-full min-w-full min-h-full">
      <style>
        {`
        aside.EmojiPickerReact.epr-main {
          width: 100%;
          height: 100%;
          min-width: 100%;
          min-height: 100%;
          --epr-picker-width: 100%;
          --epr-picker-height: 100%;
          --epr-picker-background: #00000000;
          --epr-category-label-bg-color: #0000000f;
          --epr-search-input-bg-color-active: #0000000f;
          --epr-search-input-bg-color: #00000000;
          --epr-dark: #00000000;
          --epr-bg-color: #00000000;
        }

        .epr-emoji-category-label {
          --epr-category-label-bg-color: #0000000f;
          --epr-picker-background: #00000000;
          --epr-category-label-bg-color: #0000000f;
          --epr-search-input-bg-color-active: #0000000f;
          --epr-search-input-bg-color: #00000000;
          --epr-dark: #00000000;
          --epr-bg-color: #00000000;
        }
        `}
      </style>
      <Picker
        autoFocusSearch
        onEmojiClick={onEmojiClick}
        theme={isDark ? Theme.DARK : Theme.LIGHT}
        lazyLoadEmojis={false}
        emojiStyle={EmojiStyle.NATIVE}
      />
    </motion.div>
  );
};

export default Emoji;
