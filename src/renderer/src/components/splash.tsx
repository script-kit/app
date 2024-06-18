import { useAtom } from 'jotai';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import iconUrl from '../assets/icon.png';
import {
  appConfigAtom,
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
    className="h-6 w-6 animate-spin text-text-base text-opacity-75"
    xmlns="http://www.w3.org/2000/svg"
    fill="none"
    viewBox="0 0 24 24"
  >
    <circle className="opacity-50" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
    <path
      className="opacity-100"
      fill="currentColor"
      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
    />
  </svg>
);

const questions = [
  'What problem do you want a script to solve?',
  'How are you currently dealing with this problem?',
  'Describe the last time you scripted something',
  'What tools do you use for scripting?',
  'Which API do you wish you could automate?',
  `What's your most annoying daily task?`,
  'What work task wastes your most time?',
  'What question do you think I should have asked?',
  'Anything else?',
];

function Aside() {
  const [appConfig] = useAtom(appConfigAtom);
  const [body] = useAtom(splashBodyAtom);
  const [header] = useAtom(splashHeaderAtom);
  const [progress] = useAtom(splashProgressAtom);
  const [runMainScript] = useAtom(runMainScriptAtom);

  const links = [
    {
      label: 'Community Scripts',
      href: `${appConfig.url}/scripts`,
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

  return (
    <aside className="col-span-3 flex h-full flex-col justify-between bg-bg-base/40 p-5 pt-12 shadow-inner">
      <div className="flex h-full flex-col items-center">
        <div className="relative">
          <img src={iconUrl} className="mb-2 w-24" alt="Script Kit Icon" />
          {progress !== 100 && (
            <div className="absolute right-0 top-0 rounded-full bg-bg-base bg-opacity-80 p-2 backdrop-blur-lg">
              <Spinner />
            </div>
          )}
        </div>
        <h1 className="mb-1 text-2xl font-semibold">{progress === 100 ? 'Script Kit Ready' : 'Preparing Kit...'}</h1>
        <h3 className="mx-6 text-center text-sm font-normal leading-tight opacity-70">{header}</h3>
        <h3 className="max-h-10 overflow-hidden break-all px-6 text-center text-xxs font-normal leading-tight opacity-70">
          {body}
        </h3>
        {progress === 100 && (
          <div className="flex flex-col px-4 pt-3">
            <button
              className="rounded-md border border-text-base border-opacity-25 bg-primary bg-opacity-90 px-5 py-2 font-semibold text-bg-base shadow-md shadow-primary/25 transition-all duration-200 hover:bg-opacity-100 hover:shadow-primary/50"
              type="button"
              onClick={() => {
                runMainScript();
              }}
            >
              Launch with{' '}
              <span className="text-sm">
                <kbd className="rounded-md bg-primary bg-opacity-25 p-1">{appConfig?.isMac ? 'CMD' : 'CTRL'}</kbd>
                <kbd>+</kbd>
                <kbd className="rounded-md bg-primary bg-opacity-25 p-1">;</kbd>
              </span>
            </button>
          </div>
        )}
      </div>
      <nav className="pb-4">
        {links.map(({ label, href }) => {
          return (
            <a
              key={href}
              href={href}
              className="flex w-full items-center justify-center p-1 text-sm font-normal text-text-base no-underline opacity-70 transition hover:opacity-100"
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
      setQIndex(qIndex + 1 > questions.length - 1 ? questions.length - 1 : qIndex + 1);
      setSubscribeSubmitted(subscribe);
      setContactSubmitted(contact);
      setHideEmail(email?.length > 0 && subscribe && contact);
      questionRef?.current?.focus();
    }, 1000);
  }, [subscribe, contact, response, email, question, questionRef, questionRef?.current, isSubmitting, isSubmitted]);

  const emailRequired = subscribe || contact;

  return (
    <div key="splash" className="fixed left-0 top-0 grid h-screen w-screen grid-cols-8">
      <Aside />
      <main className="col-span-5 h-full w-full bg-bg-base/10 p-6">
        <form onSubmit={handleOnSubmit} className="flex h-full flex-col justify-center">
          <fieldset className="space-y-2 p-2">
            <legend className="h-14 w-full text-lg opacity-90">
              <p className="mb-2 text-base">👋 Your feedback guides Script Kit's future:</p>

              {question && (
                <p
                  layoutId="question"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.5 }}
                  className="font-semibold"
                >
                  {question}
                </p>
              )}
            </legend>
            <div className="flex flex-col rounded-md  border border-text-base border-opacity-25 focus:border-opacity-100">
              <textarea
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
                className="w-full rounded-md border-none bg-text-base bg-opacity-5 px-5 py-3 text-lg placeholder-text-base placeholder-opacity-25 "
                rows={5}
              />
            </div>

            <div>
              {!contactSubmitted && (
                <div className="flex items-center">
                  <input
                    type="checkbox"
                    checked={contact}
                    onChange={(e) => setContact(e?.target?.checked)}
                    id="contact"
                    className="rounded-sm border border-text-base  border-opacity-25 bg-text-base bg-opacity-5 "
                  />
                  <label htmlFor="contact" className="pl-2">
                    Contact me with an example of my script idea
                  </label>
                </div>
              )}

              {!subscribeSubmitted && (
                <div className="flex items-center">
                  <div className="relative flex items-center">
                    <input
                      type="checkbox"
                      checked={subscribe}
                      onChange={(e) => setSubscribe(e?.target?.checked)}
                      id="subscribe"
                      className="rounded-sm border border-text-base  border-opacity-25 bg-text-base bg-opacity-5 "
                    />
                    <label htmlFor="subscribe" className="pl-2">
                      Receive Script Kit Tips, Tricks, and News
                    </label>
                  </div>
                </div>
              )}
              {hideEmail ? null : (
                <div className="my-3 rounded-md border border-text-base border-opacity-25 bg-text-base  bg-opacity-5">
                  <label
                    className={`absolute px-5 py-3 ${
                      emailRequired ? "after:absolute after:text-primary after:content-['*']" : ''
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
                    className="w-full rounded-md border-none bg-transparent px-5 py-3 pl-20 placeholder-text-base placeholder-opacity-25"
                    placeholder="you@company.com"
                  />
                </div>
              )}
            </div>

            <div className="flex w-full flex-row justify-between pt-2">
              <button
                type="submit"
                className="h-10 rounded-md border border-text-base border-opacity-25 bg-primary bg-opacity-90 px-5 py-2 font-medium text-bg-base transition-all hover:bg-opacity-100 hover:shadow-primary/25"
              >
                {isSubmitting ? <Spinner /> : 'Send'}
              </button>
              {/* {isSubmitted && (
                  <h2 className="-mb-1">Thanks! 🙌</h2>
                )} */}
              {isSubmitted && (subscribeSubmitted || contactSubmitted) && (
                <div className="w-9/12 pl-2 opacity-80">
                  <ul>
                    {subscribeSubmitted && <li className="pb-4">Verify the newsletter subscription in your inbox</li>}
                    {contactSubmitted && <li>We will e-mail you an example of your script idea</li>}
                  </ul>
                </div>
              )}
            </div>
          </fieldset>
        </form>
      </main>
    </div>
  );
}
