/* eslint-disable jsx-a11y/click-events-have-key-events */
/* eslint-disable jsx-a11y/no-static-element-interactions */
import { useAtom, useAtomValue } from 'jotai';
import React, { useRef, useState, useEffect, Fragment } from 'react';
import { motion } from 'framer-motion';
import { PROMPT } from '@johnlindquist/kit/core/enum';

import {
  inputHeightAtom,
  kitStateAtom,
  mouseEnabledAtom,
  openAtom,
  preloadedAtom,
  tabIndexAtom,
  tabsAtom,
  userAtom,
} from '../jotai';
import { GithubIcon } from './icons';

const TabName = ({ tab, selected }: { tab: string; selected: boolean }) => {
  const user = useAtomValue(userAtom);

  if (tab === 'Account__') {
    if (user.login) {
      return (
        <div className="flex flex-row items-center justify-center pr-8">
          <span>{user?.name?.split(' ')?.[0] || user.login}</span>
        </div>
      );
    }
    return (
      <div className="flex flex-row items-center justify-center">
        <span>Sign In</span>
        <GithubIcon
          className={`ml-2
        opacity-100`}
        />
      </div>
    );
  }

  return <span>{tab}</span>;
};

export default function KitTabs() {
  const [tabs] = useAtom(tabsAtom);
  const [mouseEnabled] = useAtom(mouseEnabledAtom);
  const [tabIndex, setTabIndex] = useAtom(tabIndexAtom);
  const [open] = useAtom(openAtom);
  const [preloaded] = useAtom(preloadedAtom);
  const [hover, setHover] = useState(-1);
  const itemsRef: any = useRef([]);
  const kitState = useAtomValue(kitStateAtom);
  const user = useAtomValue(userAtom);
  const inputHeight = useAtomValue(inputHeightAtom);

  const tabText =
    // eslint-disable-next-line no-nested-ternary
    inputHeight === PROMPT.INPUT.HEIGHT.XS
      ? `text-xs`
      : inputHeight === PROMPT.INPUT.HEIGHT.XXS
        ? `text-xxs`
        : `text-sm`;

  useEffect(() => {
    itemsRef.current = itemsRef.current.slice(0, tabs.length);

    return () => {
      itemsRef.current = [];
    };
  }, [tabs]);

  useEffect(() => {
    return () => {
      setHover(-1);
    };
  }, []);

  useEffect(() => {
    if (!itemsRef?.current?.[tabIndex]) return;
    const el = itemsRef?.current?.[tabIndex];
    if (el) {
      el.scrollIntoView({ block: 'end', inline: 'nearest' });
    }
  }, [tabIndex, itemsRef]);

  return (
    <>
      {kitState.isSponsor && tabs.includes('Account__') && (
        <>
          <img
            alt="avatar"
            src={user.avatar_url}
            className="absolute right-[14px] bottom-[4px] z-0 w-6 rounded-full"
          />
          <svg
            height="24"
            width="24"
            viewBox="0 0 24 24"
            xmlns="http://www.w3.org/2000/svg"
            className="absolute right-[5px] bottom-[17px] z-10 h-[15px] text-primary opacity-90"
          >
            <g fill="currentColor">
              <path
                d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21 12 17.27z"
                fill="currentColor"
              />
            </g>
          </svg>
        </>
      )}
      <div
        key="tabs"
        // overflow-x-scroll was causing padding underneath, how to fix?
        className="w-full"
        style={
          {
            WebkitAppRegion: 'no-drag',
            WebkitUserSelect: 'text',
          } as any
        }

        // Pay attention to the transtion to "Selected" so the bottom border line stays stable
        // initial={{ opacity: 0, y: `1rem` }}
        // animate={{ opacity: 1, y: `0px`, position: 'relative' }}
        // transition={{ duration: 0 }}
      >
        <div className="flex flex-row whitespace-nowrap px-1">
          {/* <span className="bg-white">{modeIndex}</span> */}
          {tabs.map((tab: string, i: number) => {
            return (
              // I need to research a11y for apps vs. "sites"
              <Fragment key={tab}>
                {tab === 'Account__' && <div className="flex-grow" />}
                <motion.div
                  ref={(el) => {
                    itemsRef.current[i] = el;
                  }}
                  onMouseEnter={() => {
                    if (mouseEnabled) {
                      setHover(i);
                    }
                  }}
                  onMouseLeave={() => setHover(-1)}
                  className={`
              ${tabText}
              font-medium
              ${
                // eslint-disable-next-line no-nested-ternary
                i === tabIndex
                  ? `text-text-base/90`
                  : tab === 'Account__'
                    ? `text-text-base/90 hover:text-text-base/75`
                    : `text-text-base/50 hover:text-text-base/75`
              }

              relative
              select-none
              pb-[5px]
              transition-opacity
              duration-100
              ${tabs.length > 5 ? `px-2` : `px-3`}
          `}
                  key={tab}
                  onMouseDown={() => setTabIndex(i)}
                  style={{ cursor: mouseEnabled ? 'pointer' : 'none' }}
                >
                  {i === tabIndex && (
                    <motion.div
                      className="absolute left-0 right-0 bottom-0 h-2px  bg-primary/90 transition-colors"
                      layoutDependency
                      layoutId="selectedTab"
                      transition={{ duration: preloaded ? 0 : 0.15 }}
                    />
                  )}

                  <motion.div
                    className="absolute left-0 right-0 bottom-0 h-2px   bg-primary/50 transition-colors"
                    initial={{ opacity: 0 }}
                    animate={{
                      opacity: i === hover && i !== tabIndex ? 1 : 0,
                    }}
                    transition={{ duration: preloaded ? 0 : 0.15 }}
                  />
                  <TabName tab={tab} selected={i === tabIndex} />
                </motion.div>
              </Fragment>
            );
          })}
        </div>
      </div>
    </>
  );
}
