import React from 'react';
import parse from 'html-react-parser';
import { motion } from 'framer-motion';

import { useAtom } from 'jotai';
import { hintAtom } from '../jotai';

export default function Hint() {
  const [hint] = useAtom(hintAtom);

  return (
    <motion.div
      key="hint"
      initial={{ opacity: 1 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.2 }}
      exit={{ opacity: 0 }}
      className="px-4 py-1 text-xs text-gray-800 dark:text-gray-200 italic"
    >
      {parse(hint)}
    </motion.div>
  );
}
