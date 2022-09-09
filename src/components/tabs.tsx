/* eslint-disable jsx-a11y/click-events-have-key-events */
/* eslint-disable jsx-a11y/no-static-element-interactions */
import { useAtom } from 'jotai';
import React, { useRef, useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { mouseEnabledAtom, openAtom, tabIndexAtom, tabsAtom } from '../jotai';

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
      <motion.div className="flex flex-row pl-1 whitespace-nowrap">
        {/* <span className="bg-white">{modeIndex}</span> */}
        {tabs.map((tab: string, i: number) => {
          return (
            // I need to research a11y for apps vs. "sites"
            <motion.div
              ref={(el) => {
                itemsRef.current[i] = el;
              }}
              onHoverStart={() => setHover(i)}
              onHoverEnd={() => setHover(-1)}
              className={`
              text-sm
              font-medium
              text-black dark:text-white
              relative
              select-none
              ${tabs.length > 5 ? `px-2` : `px-3`}
              pb-1.5
          `}
              key={tab}
              onMouseDown={() => setTabIndex(i)}
              style={{ cursor: mouseEnabled ? 'pointer' : 'none' }}
              whileHover={
                { '--tw-text-opacity': i === tabIndex ? '1' : '0.75' } as any
              }
              animate={
                { '--tw-text-opacity': i === tabIndex ? '0.9' : '0.5' } as any
              }
            >
              {tab}

              {i === tabIndex && open && (
                <motion.div
                  className="bg-primary-dark dark:bg-primary-light h-0.5 left-0 right-0 -bottom-px absolute"
                  layoutDependency
                  layoutId="selectedTab"
                  transition={{ duration: 0.15 }}
                />
              )}

              <motion.div
                className="bg-black dark:bg-white h-0.5 left-0 right-0 -bottom-px absolute bg-opacity-20 dark:bg-opacity-40"
                initial={{ opacity: 0 }}
                animate={{ opacity: i === hover && i !== tabIndex ? 1 : 0 }}
                transition={{ duration: 0.15 }}
              />
            </motion.div>
          );
        })}
      </motion.div>
    </motion.div>
  );
}
