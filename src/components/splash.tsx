// kitapp/src/components/splash.tsx

/* eslint-disable no-nested-ternary */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { motion, useAnimation } from 'framer-motion';
import { useAtom } from 'jotai';
import {
  appConfigAtom,
  getAssetAtom,
  runMainScriptAtom,
  splashBodyAtom,
  splashHeaderAtom,
  splashProgressAtom,
  submitSurveyAtom,
} from '../jotai';
import { useEscape } from '../hooks';

// const questions = [
//   `What problem should Script Kit will solve for you?`,
//   `What's something you'ven want to write a script for?`,
//   `What's your idea of the perfect developer tool?`,
//   `What's stopped you from writing scripts in the past?`,
// ];

const Spinner = () => (
  <svg
    className="animate-spin h-6 w-6 text-black text-opacity-75 dark:text-white dark:text-opacity-75"
    xmlns="http://www.w3.org/2000/svg"
    fill="none"
    viewBox="0 0 24 24"
  >
    <circle
      className="opacity-50"
      cx="12"
      cy="12"
      r="10"
      stroke="currentColor"
      strokeWidth="4"
    />
    <path
      className="opacity-100"
      fill="currentColor"
      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
    />
  </svg>
);

const links = [
  {
    label: 'Community Scripts',
    href: 'https://www.scriptkit.com/scripts',
  },
  {
    label: 'Documentation',
    href: 'https://github.com/johnlindquist/kit/discussions/categories/docs',
  },
  {
    label: 'Get Help',
    href: 'https://github.com/johnlindquist/kit/discussions/categories/q-a',
  },
];

function Aside() {
  const [appConfig] = useAtom(appConfigAtom);
  const [getAsset] = useAtom(getAssetAtom);
  const [body] = useAtom(splashBodyAtom);
  const [header] = useAtom(splashHeaderAtom);
  const [progress] = useAtom(splashProgressAtom);
  const [runMainScript] = useAtom(runMainScriptAtom);

  return (
    <aside className="col-span-3 flex flex-col justify-between h-full p-5 pt-12">
      <div className="flex flex-col items-center h-full">
        <div className="relative">
          <img
            src={getAsset('icon.png')}
            className="w-24 mb-2"
            alt="Script Kit Icon"
          />
          {progress !== 100 && (
            <div className="absolute right-0 top-0 bg-black rounded-full p-2 bg-opacity-80 backdrop-blur-lg">
              <Spinner />
            </div>
          )}
        </div>
        <h1 className="text-2xl font-semibold mb-1">
          {progress === 100 ? 'Script Kit Installed' : 'Installing Script Kit'}
        </h1>
        <h3 className="font-normal text-sm opacity-70 text-center leading-tight">
          {header}
        </h3>
        <h3 className="font-normal text-sm opacity-70 text-center leading-tight">
          {body}
        </h3>
        {progress === 100 && (
          <div className="pt-3">
            <button
              className="rounded-md shadow-md px-5 py-2 bg-gradient-to-b from-yellow-400 to-amber-500 text-black font-semibold"
              type="button"
              onClick={() => {
                runMainScript();
              }}
            >
              Launch with{' '}
              <span className="text-sm">
                <kbd className="bg-amber-600 rounded-md bg-opacity-50 p-1">
                  {appConfig?.isMac ? 'CMD' : 'CTRL'}
                </kbd>
                <kbd>+</kbd>
                <kbd className="bg-amber-600 rounded-md bg-opacity-50 p-1">
                  ;
                </kbd>
              </span>
            </button>
          </div>
        )}
      </div>
      <nav className="pb-8">
        {links.map(({ label, href }) => {
          return (
            <a
              key={href}
              href={href}
              className="no-underline flex items-center justify-center w-full dark:text-white text-black text-sm font-normal opacity-70 hover:opacity-100 p-1 transition"
            >
              {label}
            </a>
          );
        })}
      </nav>
      <small className="text-center opacity-40">{appConfig.version}</small>
    </aside>
  );
}

export default function Splash() {
  const [, submitSurvey] = useAtom(submitSurveyAtom);

  useEscape();
  const [isSubmitted, setSubmitted] = React.useState<boolean>(false);
  const [isSubmitting, setSubmitting] = React.useState<boolean>(false);
  const [response, setResponse] = React.useState<string>('');
  const [email, setEmail] = React.useState<string>('');
  const [question, setQuestion] = useState<string>('');
  const [subscribe, setSubscribe] = useState(false);
  const [contact, setContact] = useState(false);
  const questionRef = useRef<HTMLTextAreaElement>();
  const emailRef = useRef<HTMLInputElement>();

  useEffect(() => {
    setQuestion(`What kind of script do you want to write?`);
    if (questionRef?.current) {
      questionRef?.current?.focus();
    } else {
      setTimeout(() => {
        questionRef?.current?.focus();
      }, 250);
    }
  }, [questionRef, questionRef?.current]);

  const handleOnSubmit = useCallback(() => {
    submitSurvey({
      question,
      response,
      email,
      subscribe,
      contact,
    });
    // submitting
    setSubmitting(true);
    // done
    return setTimeout(() => {
      setSubmitting(false);
      setSubmitted(true);
      setResponse('');
      questionRef?.current?.focus();

      // questionRef?.current?.focus();
    }, 1000);
  }, [
    response,
    email,
    question,
    questionRef,
    questionRef?.current,
    isSubmitting,
    isSubmitted,
  ]);

  const controls = useAnimation();

  React.useEffect(() => {
    // the "thanks!" label
    controls.start({
      opacity: [0, 1],
      x: [-5, 0],
    });
    // hide once submitted, but not immidiately
    const timer = setTimeout(() => {
      controls.start({
        opacity: 0,
        transition: { duration: 3 },
      });
    }, 2000);
    return () => {
      clearTimeout(timer);
    };
  }, [isSubmitted]);

  return (
    <motion.div
      key="splash"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.5 }}
      className="grid grid-cols-8 left-0 top-0 fixed w-screen h-screen bg-white bg-opacity-40 dark:bg-black dark:bg-opacity-40"
    >
      <Aside />
      <main className="bg-white bg-opacity-5 col-span-5 h-full p-8">
        <form
          onSubmit={handleOnSubmit}
          className="flex flex-col h-full justify-center"
        >
          <fieldset className="space-y-3">
            <legend className="text-lg opacity-90">
              <p>Hey! 👋</p>
              <p className="font-semibold">{question}</p>
            </legend>
            <div className="rounded-md bg-bg-light dark:bg-bg-dark bg-opacity-50 dark:bg-opacity-75 border border-white border-opacity-15 flex flex-col">
              <textarea
                ref={questionRef}
                value={response}
                // onKeyDown={onMaybeEnter}
                onChange={(e) => {
                  setResponse(e.currentTarget.value);
                }}
                id="answer"
                required
                placeholder={
                  isSubmitted
                    ? 'What else would you like to see in a script?'
                    : 'Type your script idea here...'
                }
                className="text-lg w-full rounded-t-md border-none bg-transparent px-5 py-3"
                rows={5}
              />
            </div>
            {!isSubmitted && (
              <div>
                <div className="flex flex-row items-center">
                  <div className="relative flex items-center border-t border-white border-opacity-10">
                    <input
                      type="checkbox"
                      checked={subscribe}
                      onChange={(e) => setSubscribe(Boolean(!subscribe))}
                      id="subscribe"
                    />
                    <label htmlFor="subscribe" className="pl-2">
                      Contact me to help automate this
                    </label>
                  </div>
                </div>
                <div className="flex flex-row items-center">
                  <input
                    type="checkbox"
                    checked={contact}
                    onChange={(e) => setContact(Boolean(!contact))}
                    id="contact"
                  />
                  <label htmlFor="contact" className="pl-2">
                    Receive Script Kit Tips, Tricks, and News
                  </label>
                </div>
                <div className="rounded-md bg-bg-light dark:bg-bg-dark bg-opacity-50 dark:bg-opacity-75 border border-white border-opacity-15 my-3">
                  <label className="px-5 py-3 absolute" htmlFor="email">
                    Email:
                  </label>
                  <input
                    ref={emailRef}
                    onChange={(event) => setEmail(event.target.value)}
                    type="email"
                    id="email"
                    className="px-5 pl-20 py-3 border-none bg-transparent w-full rounded-b-md"
                    placeholder="you@company.com"
                  />
                </div>
              </div>
            )}
            <div className="flex space-x-5 items-center">
              <button
                type="submit"
                className="rounded-md bg-primary-light dark:bg-bg-light bg-opacity-75 dark:bg-opacity-20 hover:bg-opacity-100 dark:hover:bg-opacity-30 transition px-5 py-2 font-medium"
              >
                {isSubmitting ? <Spinner /> : 'Send'}
              </button>
            </div>
          </fieldset>
          {isSubmitted && (
            <div className="opacity-80 pt-6">
              <h2>Thanks! 🙌</h2>
              <ul>
                {subscribe && (
                  <li>Verify the newsletter subscription in your inbox</li>
                )}
                {contact && (
                  <li>
                    We will follow up via e-mail on your automation request
                  </li>
                )}
              </ul>
            </div>
          )}
        </form>
      </main>
    </motion.div>
  );
}
