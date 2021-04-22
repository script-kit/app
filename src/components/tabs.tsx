/* eslint-disable jsx-a11y/click-events-have-key-events */
/* eslint-disable jsx-a11y/no-static-element-interactions */
import React from 'react';
import SimpleBar from 'simplebar-react';

interface KitTabsProps {
  tabs: string[];
  tabIndex: number;
  onTabClick: (i: number) => (event: any) => void;
}

export default function KitTabs({ tabs, tabIndex, onTabClick }: KitTabsProps) {
  return (
    <SimpleBar
      className="overscroll-y-none"
      style={
        {
          WebkitAppRegion: 'no-drag',
          WebkitUserSelect: 'text',
        } as any
      }
    >
      <div className="flex flex-row pl-2 whitespace-nowrap">
        {/* <span className="bg-white">{modeIndex}</span> */}
        {tabs.map((tab: string, i: number) => {
          return (
            // I need to research a11y for apps vs. "sites"
            <div
              className={`text-xs px-2 py-1 mb-1 mx-px dark:bg-o rounded-full font-medium cursor-pointer dark:bg-primary-light dark:hover:bg-white bg-white hover:opacity-100 dark:hover:opacity-100 dark:hover:bg-opacity-10 hover:bg-opacity-80 ${
                i === tabIndex
                  ? 'opacity-100 dark:bg-opacity-10 bg-opacity-80 dark:text-primary-light text-primary-dark'
                  : 'opacity-70 dark:bg-opacity-0 bg-opacity-0'
              }
          transition-all ease-in-out duration-100
          `}
              key={tab}
              onClick={onTabClick(i)}
            >
              {tab}
            </div>
          );
        })}
      </div>
    </SimpleBar>
  );
}
