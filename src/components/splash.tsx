/* eslint-disable no-nested-ternary */
import React from 'react';
import { motion } from 'framer-motion';
import { useAtom } from 'jotai';
import {
  appConfigAtom,
  getAssetAtom,
  isReadyAtom,
  runMainScriptAtom,
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
  const [runMainScript] = useAtom(runMainScriptAtom);

  useEscape();

  const Spinner = () => (
    <svg
      className="animate-spin h-6 w-6 text-primary-dark dark:text-primary-light"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  );

  const links = [
    {
      label: 'Community Scripts ↗︎',
      href: 'https://www.scriptkit.com/scripts',
    },
    {
      label: 'Documentation ↗︎',
      href: 'https://github.com/johnlindquist/kit/discussions/categories/docs',
    },
    {
      label: 'Get Help ↗︎',
      href: 'https://github.com/johnlindquist/kit/discussions/categories/q-a',
    },
  ];

  return (
    <motion.div
      key="splash"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0 }}
      className="pt-5 left-0 top-0 fixed w-screen h-screen flex flex-col items-center prose dark:prose-dark bg-white bg-opacity-40 dark:bg-black dark:bg-opacity-40"
    >
      <header className="flex flex-col items-center justify-center">
        <motion.img src={getAsset('icon.png')} className="w-24 mb-2" />
        <h1 className="text-2xl font-semibold mb-1">
          Script Kit {appConfig.version}
        </h1>
        <h3 className="font-normal text-base opacity-90">{header}</h3>
      </header>
      <main className="flex flex-col items-center justify-center h-full pb-4">
        {progress === 100 ? (
          <div className="w-full flex items-center justify-center space-x-5">
            <button
              type="button"
              className="bg-primary-light dark:bg-primary-light text-black dark:text-black px-8 py-4 rounded-md font-semibold"
              onClick={() => {
                runMainScript();
              }}
            >
              Launch Script Kit with{' '}
              <kbd className="bg-black dark:bg-black dark:text-black text-black px-2 py-1 rounded-sm dark:bg-opacity-10 bg-opacity-10">
                {appConfig?.isWin ? 'CTRL' : 'CMD'} + ;
              </kbd>
            </button>
          </div>
        ) : (
          <div>
            <Spinner />
          </div>
        )}
        {body && progress !== 100 && (
          <h3 className="font-normal text-base opacity-90">{body}</h3>
        )}
      </main>
      <div className="w-full grid grid-cols-3 items-center justify-center py-8 border-t dark:border-white dark:border-opacity-10 border-black border-opacity-10">
        {links.map(({ label, href }) => {
          return (
            <a
              key={href}
              href={href}
              className="no-underline flex items-center justify-center w-full dark:text-white text-black text-sm font-normal opacity-80 hover:opacity-100 p-2"
            >
              {label}
            </a>
          );
        })}
      </div>
    </motion.div>
  );
}
