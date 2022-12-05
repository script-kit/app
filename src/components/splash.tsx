// kitapp/src/components/splash.tsx
/* eslint-disable jsx-a11y/accessible-emoji */
/* eslint-disable no-nested-ternary */
/* eslint-disable react/no-unescaped-entities */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, AnimateSharedLayout, motion } from 'framer-motion';
import { useAtom } from 'jotai';
import { loadable } from 'jotai/utils';
import {
  appConfigAtom,
  createAssetAtom,
  runMainScriptAtom,
  splashBodyAtom,
  splashHeaderAtom,
  splashProgressAtom,
  submitSurveyAtom,
} from '../jotai';

// const questions = [
//   `What problem should Script Kit will solve for you?`,
//   `What's something you'ven want to write a script for?`,
//   `What's your idea of the perfect developer tool?`,
//   `What's stopped you from writing scripts in the past?`,
// ];

const Spinner = () => (
  <svg
    className="animate-spin h-6 w-6 text-white text-opacity-75 dark:text-white dark:text-opacity-75"
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
  // {
  //   label: 'Documentation',
  //   href: 'https://github.com/johnlindquist/kit/discussions/categories/docs',
  // },
  {
    label: 'Questions?',
    href: 'https://github.com/johnlindquist/kit/discussions/categories/q-a',
  },
];

const questions = [
  `What problem do you want a script to solve?`,
  `How are you currently dealing with this problem?`,
  `Describe the last time you scripted something`,
  `What tools do you use for scripting?`,
  `Which API do you wish you could automate?`,
  `What's your most annoying daily task?`,
  `What work task wastes your most time?`,
  `What question do you think I should have asked?`,
  `Anything else?`,
];

const loadableIconAtom = loadable(createAssetAtom('icon.png'));

function Aside() {
  const [appConfig] = useAtom(appConfigAtom);
  const [body] = useAtom(splashBodyAtom);
  const [header] = useAtom(splashHeaderAtom);
  const [progress] = useAtom(splashProgressAtom);
  const [runMainScript] = useAtom(runMainScriptAtom);

  const [lazyIcon] = useAtom(loadableIconAtom);

  return (
    <aside className="col-span-3 flex flex-col justify-between h-full p-5 pt-12 shadow-inner bg-bg-light dark:bg-bg-dark bg-opacity-90 dark:bg-opacity-90">
      <div className="flex flex-col items-center h-full">
        <div className="relative">
          <img
            src={lazyIcon?.data}
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
          {progress === 100 ? 'Script Kit Ready' : 'Preparing Kit...'}
        </h1>
        <h3 className="font-normal text-sm opacity-70 text-center leading-tight mx-6">
          {header}
        </h3>
        <h3 className="font-normal text-xxs opacity-70 text-center leading-tight px-6 break-all max-h-10 overflow-hidden">
          {body}
        </h3>
        {progress === 100 && (
          <div className="pt-3 flex flex-col px-4">
            <button
              className="rounded-md shadow-md px-5 py-2 bg-gradient-to-b from-default-400 to-amber-500 text-text-base font-semibold"
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
            <span className="text-xxs px-5 py-4 leading-tight text-center">
              Snippets and Clipboard History require "Accessibility Permissions"
            </span>
          </div>
        )}
      </div>
      <nav className="pb-4">
        {links.map(({ label, href }) => {
          return (
            <a
              key={href}
              href={href}
              className="no-underline flex items-center justify-center w-full dark:text-white text-text-base text-sm font-normal opacity-70 hover:opacity-100 p-1 transition"
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

  // useEscape();
  const [isSubmitted, setSubmitted] = React.useState<boolean>(false);
  const [isSubmitting, setSubmitting] = React.useState<boolean>(false);
  const [response, setResponse] = React.useState<string>('');
  const [email, setEmail] = React.useState<string>('');
  const [question, setQuestion] = useState<string>('');
  const [subscribe, setSubscribe] = useState(false);
  const [subscribeSubmitted, setSubscribeSubmitted] = useState(false);
  const [contactSubmitted, setContactSubmitted] = useState(false);
  const [hideEmail, setHideEmail] = useState(false);
  const [contact, setContact] = useState(false);
  const questionRef = useRef<HTMLTextAreaElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const [qIndex, setQIndex] = useState(0);

  useEffect(() => {
    setQuestion(questions[qIndex]);
  }, [questionRef, questionRef?.current, qIndex]);

  useEffect(() => {
    setTimeout(() => {
      questionRef?.current?.focus();
    }, 250);
  }, [questionRef?.current]);

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
    setQuestion('');
    return setTimeout(() => {
      setSubmitting(false);
      setSubmitted(true);
      setResponse('');
      setQIndex(
        qIndex + 1 > questions.length - 1 ? questions.length - 1 : qIndex + 1
      );
      setSubscribeSubmitted(subscribe);
      setContactSubmitted(contact);
      setHideEmail(email?.length > 0 && subscribe && contact);
      questionRef?.current?.focus();
    }, 1000);
  }, [
    subscribe,
    contact,
    response,
    email,
    question,
    questionRef,
    questionRef?.current,
    isSubmitting,
    isSubmitted,
  ]);

  const emailRequired = subscribe || contact;

  return (
    <motion.div
      key="splash"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.5 }}
      className="grid grid-cols-8 left-0 top-0 fixed w-screen h-screen"
    >
      <Aside />
      <main className="bg-bg-light dark:bg-black bg:opacity-0 dark:bg-opacity-0 col-span-5 w-full h-full p-6">
        <form
          onSubmit={handleOnSubmit}
          className="flex flex-col h-full justify-center"
        >
          <fieldset className="space-y-2 p-2">
            <legend className="text-lg opacity-90 w-full h-14">
              <p className="text-base mb-2">
                👋 Your feedback guides Script Kit's future:
              </p>
              <AnimateSharedLayout type="crossfade">
                <AnimatePresence key="splashComponents">
                  {question && (
                    <motion.p
                      layoutId="question"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.5 }}
                      className="font-semibold"
                    >
                      {question}
                    </motion.p>
                  )}
                </AnimatePresence>
              </AnimateSharedLayout>
            </legend>
            <motion.div className="rounded-md bg-bg-light dark:bg-bg-dark bg-opacity-50 dark:bg-opacity-50 border dark:border-white dark:border-opacity-25 flex flex-col">
              <motion.textarea
                autoFocus
                tabIndex={0}
                ref={questionRef}
                value={response}
                // onKeyDown={onMaybeEnter}
                onChange={(e) => {
                  setResponse(e?.currentTarget?.value || '');
                }}
                id="answer"
                required={contact && !subscribe}
                placeholder="Type your answer here..."
                className="text-lg w-full rounded-md border-none bg-transparent dark:bg-transparent px-5 py-3"
                rows={5}
              />
            </motion.div>

            <motion.div>
              {!contactSubmitted && (
                <motion.div className="flex items-center">
                  <input
                    type="checkbox"
                    checked={contact}
                    onChange={(e) => setContact(e?.target?.checked || false)}
                    id="contact"
                    className="dark:bg-white bg-black dark:bg-opacity-20 bg-opacity-10 rounded-sm"
                  />
                  <label htmlFor="contact" className="pl-2">
                    Contact me with an example of my script idea
                  </label>
                </motion.div>
              )}

              {!subscribeSubmitted && (
                <motion.div className="flex items-center">
                  <div className="relative flex items-center">
                    <input
                      type="checkbox"
                      checked={subscribe}
                      onChange={(e) =>
                        setSubscribe(e?.target?.checked || false)
                      }
                      id="subscribe"
                      className="dark:bg-white bg-black dark:bg-opacity-20 bg-opacity-10 rounded-sm"
                    />
                    <label htmlFor="subscribe" className="pl-2">
                      Receive Script Kit Tips, Tricks, and News
                    </label>
                  </div>
                </motion.div>
              )}
              {!hideEmail ? (
                <motion.div className="rounded-md bg-bg-light dark:bg-bg-dark bg-opacity-50 dark:bg-opacity-50 border dark:border-white dark:border-opacity-25 my-3">
                  <label
                    className={`px-5 py-3 absolute ${
                      emailRequired
                        ? "after:content-['*'] after:absolute dark:after:text-primary after:text-primary"
                        : ''
                    }`}
                    htmlFor="email"
                  >
                    Email
                  </label>
                  <input
                    required={emailRequired}
                    ref={emailRef}
                    onChange={(event) => setEmail(event.target.value || '')}
                    value={email}
                    type="email"
                    id="email"
                    className="px-5 pl-20 py-3 border-none bg-transparent dark:bg-transparent w-full rounded-md"
                    placeholder="you@company.com"
                  />
                </motion.div>
              ) : null}
            </motion.div>

            <motion.div className="flex flex-row justify-between w-full pt-2">
              <button
                type="submit"
                className="rounded-md bg-primary dark:bg-bg-light hover:bg-opacity-50 dark:bg-opacity-20 dark:hover:bg-opacity-30 transition px-5 py-2 font-medium h-10"
              >
                {isSubmitting ? <Spinner /> : 'Send'}
              </button>
              {/* {isSubmitted && (
                  <motion.h2 className="-mb-1">Thanks! 🙌</motion.h2>
                )} */}
              {isSubmitted && (subscribeSubmitted || contactSubmitted) && (
                <motion.div className="opacity-80 pl-2 w-9/12">
                  <ul>
                    {subscribeSubmitted && (
                      <li className="pb-4">
                        Verify the newsletter subscription in your inbox
                      </li>
                    )}
                    {contactSubmitted && (
                      <li>We will e-mail you an example of your script idea</li>
                    )}
                  </ul>
                </motion.div>
              )}
            </motion.div>
          </fieldset>
        </form>
      </main>
    </motion.div>
  );
}
