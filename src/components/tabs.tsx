/* eslint-disable jsx-a11y/click-events-have-key-events */
/* eslint-disable jsx-a11y/no-static-element-interactions */
import { useAtom, useAtomValue } from 'jotai';
import React, { useRef, useState, useEffect, Fragment } from 'react';
import { motion } from 'framer-motion';
import {
  kitStateAtom,
  mouseEnabledAtom,
  openAtom,
  tabIndexAtom,
  tabsAtom,
  userAtom,
} from '../jotai';

const GithubIcon = ({ className }) => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 16 16"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
  >
    <g clipPath="url(#clip0_903_574)">
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M8 0.200195C3.6 0.200195 0 3.8002 0 8.2002C0 11.7002 2.3 14.7002 5.5 15.8002C5.9 15.9002 6 15.6002 6 15.4002C6 15.2002 6 14.7002 6 14.0002C3.8 14.5002 3.3 13.0002 3.3 13.0002C2.9 12.1002 2.4 11.8002 2.4 11.8002C1.7 11.3002 2.5 11.3002 2.5 11.3002C3.3 11.4002 3.7 12.1002 3.7 12.1002C4.4 13.4002 5.6 13.0002 6 12.8002C6.1 12.3002 6.3 11.9002 6.5 11.7002C4.7 11.5002 2.9 10.8002 2.9 7.7002C2.9 6.8002 3.2 6.1002 3.7 5.6002C3.6 5.4002 3.3 4.6002 3.8 3.5002C3.8 3.5002 4.5 3.3002 6 4.3002C6.6 4.1002 7.3 4.0002 8 4.0002C8.7 4.0002 9.4 4.1002 10 4.3002C11.5 3.3002 12.2 3.5002 12.2 3.5002C12.6 4.6002 12.4 5.4002 12.3 5.6002C12.8 6.2002 13.1 6.9002 13.1 7.7002C13.1 10.8002 11.2 11.4002 9.4 11.6002C9.7 12.0002 10 12.5002 10 13.2002C10 14.3002 10 15.1002 10 15.4002C10 15.6002 10.1 15.9002 10.6 15.8002C13.8 14.7002 16.1 11.7002 16.1 8.2002C16 3.8002 12.4 0.200195 8 0.200195Z"
        fill="currentColor"
      />
    </g>
    <defs>
      <clipPath id="clip0_903_574">
        <rect width="16" height="16" fill="currentColor" />
      </clipPath>
    </defs>
  </svg>
);

const TabName = ({ tab, selected }: { tab: string; selected: boolean }) => {
  const user = useAtomValue(userAtom);
  const kitState = useAtomValue(kitStateAtom);

  if (tab === 'Account__') {
    if (user.login) {
      return (
        <div className="flex flex-row justify-center items-center -mb-1">
          <span>{user?.name?.split(' ')?.[0] || user.login}</span>
          {kitState.isSponsor && (
            <svg
              height="24"
              width="24"
              viewBox="0 0 24 24"
              xmlns="http://www.w3.org/2000/svg"
              className={`absolute z-20 h-4 -right-0.5 -top-1 text-primary dark:text-white
              opacity-90
              `}
            >
              <g fill="currentColor">
                <path
                  d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21 12 17.27z"
                  fill="currentColor"
                />
              </g>
            </svg>
          )}
          <img
            alt="avatar"
            src={user.avatar_url}
            className={`w-6 rounded-full
            ml-2 relative z-0`}
          />
        </div>
      );
    }
    return (
      <div className="flex flex-row justify-center items-center">
        <span>Sign In</span>
        <GithubIcon
          className={`ml-2 mb-0.5
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
  const [hover, setHover] = useState(-1);
  const itemsRef: any = useRef([]);

  useEffect(() => {
    itemsRef.current = itemsRef.current.slice(0, tabs.length);
  }, [tabs]);

  // useEffect(() => {
  //   const el = itemsRef?.current?.[tabIndex];
  //   if (el) {
  //     el.scrollIntoView({ block: 'end', inline: 'nearest' });
  //   }
  // }, [tabIndex, itemsRef]);

  return (
    <motion.div
      key="tabs"
      className="w-full"
      style={
        {
          WebkitAppRegion: 'no-drag',
          WebkitUserSelect: 'text',
        } as any
      }
      layout="position"
      initial={{ opacity: 0, y: `1rem` }}
      animate={{ opacity: 1, y: `0px`, position: 'relative' }}
      transition={{ duration: 0.15 }}
    >
      <motion.div className="flex flex-row px-1 whitespace-nowrap">
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
                onHoverStart={() => setHover(i)}
                onHoverEnd={() => setHover(-1)}
                className={`
              text-sm
              font-medium
              text-text-base dark:text-white
              relative
              select-none
              ${tabs.length > 5 ? `px-2` : `px-3`}
              pb-1.5
              transition-colors
          `}
                key={tab}
                onMouseDown={() => setTabIndex(i)}
                style={{ cursor: mouseEnabled ? 'pointer' : 'none' }}
                whileHover={
                  { '--tw-text-opacity': i === tabIndex ? '1' : '0.75' } as any
                }
                animate={
                  {
                    '--tw-text-opacity':
                      // eslint-disable-next-line no-nested-ternary
                      i === tabIndex
                        ? '0.9'
                        : tab === 'Account__'
                        ? '0.9'
                        : '0.5',
                  } as any
                }
              >
                <TabName tab={tab} selected={i === tabIndex} />

                {i === tabIndex && open && (
                  <motion.div
                    className="bg-primary bg-opacity-90 h-0.5 left-0 right-0 -bottom-px absolute transition-colors"
                    layoutDependency
                    layoutId="selectedTab"
                    transition={{ duration: 0.15 }}
                  />
                )}

                <motion.div
                  className="bg-primary bg-opacity-50 h-0.5 left-0 right-0 -bottom-px absolute transition-colors"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: i === hover && i !== tabIndex ? 1 : 0 }}
                  transition={{ duration: 0.15 }}
                />
              </motion.div>
            </Fragment>
          );
        })}
      </motion.div>
    </motion.div>
  );
}
