import React from 'react';
import Picker from 'emoji-picker-react';
import { useAtomValue, useSetAtom } from 'jotai';
import { darkAtom, submitValueAtom } from '../jotai';
import { useObserveMainHeight } from '../hooks';

const Emoji = ({ width, height }) => {
  const submit = useSetAtom(submitValueAtom);
  const isDark = useAtomValue(darkAtom);
  useObserveMainHeight('.emoji-picker-react');

  const onEmojiClick = (event, emojiObject) => {
    submit(emojiObject);
  };

  return (
    <Picker
      pickerStyle={{
        backgroundColor: '#00000000',
        color: isDark ? 'white' : 'black',
        width,
        height,
        boxShadow: '0 0 0 0',
        outline: 'none',
        border: 'none',
      }}
      onEmojiClick={onEmojiClick}
      native
    />
  );
};

export default Emoji;
