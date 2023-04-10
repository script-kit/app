/* eslint-disable jsx-a11y/anchor-is-valid */
/* eslint-disable jsx-a11y/no-static-element-interactions */
/* eslint-disable jsx-a11y/click-events-have-key-events */
/* eslint-disable react/jsx-props-no-spreading */
import { motion } from 'framer-motion';
import React from 'react';
import { _flag, _choices, _index } from '../jotai';
import { transition } from './actions';

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
      text-primary  text-opacity-10
      bg-opacity-0
      p-0.5
      text-center
"
    >
      |
    </motion.div>
  );
}
