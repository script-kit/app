/* eslint-disable no-nested-ternary */
import React from 'react';
import { motion } from 'framer-motion';
import { useAtom } from 'jotai';
import {
  appConfigAtom,
  getAssetAtom,
  isReadyAtom,
  splashBodyAtom,
  splashHeaderAtom,
  splashProgressAtom,
} from '../jotai';
import { useEscape } from '../hooks';

export default function Splash() {
  const [appConfig] = useAtom(appConfigAtom);
  const [getAsset] = useAtom(getAssetAtom);
  const [body] = useAtom(splashBodyAtom);
  const [header] = useAtom(splashHeaderAtom);
  const [progress] = useAtom(splashProgressAtom);
  const [isReady] = useAtom(isReadyAtom);

  useEscape();

  return (
    <motion.div
      key="splash"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0 }}
      className="left-0 top-0 fixed w-screen h-screen flex flex-col items-center prose dark:prose-dark px-10 pt-20

      bg-white bg-opacity-40
      dark:bg-black dark:bg-opacity-40

      "
    >
      <h1 className="header pt-4">Script Kit {appConfig.version}</h1>
      <h3>{header}</h3>

      <motion.img
        animate={{
          filter: ['hue-rotate(0deg)', 'hue-rotate(180deg)'],
        }}
        transition={{
          duration: 2,
          repeat: Infinity,
          repeatType: 'reverse',
        }}
        src={getAsset('icon.png')}
        className="w-32"
      />

      <motion.div className="message py-4 w-10/12 text-center truncate">
        {body}
      </motion.div>
    </motion.div>
  );
}
