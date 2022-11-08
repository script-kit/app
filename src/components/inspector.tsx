/* eslint-disable react/jsx-no-duplicate-props */
import React from 'react';
import { motion } from 'framer-motion';

type Props = {
  width: number;
  height: number;
};
const Inspector = ({ width, height }: Props) => {
  return (
    <motion.div className="w-full h-full min-w-full min-h-full">
      <div className="text-4xl">Debugger Open</div>
    </motion.div>
  );
};

export default Inspector;
