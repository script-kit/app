/* eslint-disable jsx-a11y/click-events-have-key-events */
/* eslint-disable jsx-a11y/no-static-element-interactions */
import { useAtom } from 'jotai';
import React from 'react';
import SimpleBar from 'simplebar-react';
import { mouseEnabledAtom, tabIndexAtom, tabsAtom } from '../jotai';

export default function KitTabs() {
  const [tabs] = useAtom(tabsAtom);
  const [mouseEnabled] = useAtom(mouseEnabledAtom);
  const [tabIndex, setTabIndex] = useAtom(tabIndexAtom);
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
      <div className="flex flex-row pl-1 whitespace-nowrap">
        {/* <span className="bg-white">{modeIndex}</span> */}
        {tabs.map((tab: string, i: number) => {
          return (
            // I need to research a11y for apps vs. "sites"
            <div
              className={`
              text-xs pb-1
              font-medium
              text-black dark:text-white

              hover:text-opacity-75 dark:hover:text-opacity-100
              hover:border-b-2 dark:hover:border-b-2
              border-opacity-75 hover:border-opacity-75
              hover:border-primary-dark dark:hover:border-primary-light
              transition-all duration-100 ease-in-out

              ${
                i === tabIndex
                  ? `border-b-2 border-primary-dark dark:border-primary-light
                  opacity-100 dark:bg-opacity-10 bg-opacity-60
                  dark:text-primary-light text-primary-dark`
                  : 'dark:bg-opacity-0 bg-opacity-0 text-opacity-50 dark:text-opacity-50'
              }

              ${tabs.length > 5 ? `px-2` : `px-3`}
          `}
              key={tab}
              onMouseDown={() => setTabIndex(i)}
              style={{ cursor: mouseEnabled ? 'pointer' : 'none' }}
            >
              {tab}
            </div>
          );
        })}
      </div>
    </SimpleBar>
  );
}
