/* eslint-disable react/jsx-no-duplicate-props */
import React from 'react';
import { motion } from 'framer-motion';

const Inspector = () => {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: [0, 1] }}
      transition={{ duration: 0.25, ease: 'circOut' }}
      className="w-full h-full min-w-full min-h-full p-5"
    >
      <div className="text-2xl text-text-base dark:text-white">
        Debugger Opening...
      </div>
    </motion.div>
  );
};

export default Inspector;
