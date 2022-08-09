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
      className="px-4 py-2 font-medium text-sm
      text-primary-dark dark:text-primary-light
      "
    >
      {parse(hint)}
    </motion.div>
  );
}
