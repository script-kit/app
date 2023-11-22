/* eslint-disable jsx-a11y/anchor-is-valid */
/* eslint-disable jsx-a11y/no-static-element-interactions */
/* eslint-disable jsx-a11y/click-events-have-key-events */
import { useAtom, useAtomValue } from 'jotai';
import { loadable } from 'jotai/utils';
import React from 'react';

import { ipcRenderer } from 'electron';
import { createAssetAtom, loadingAtom } from '../jotai';
import { AppChannel } from '../enums';

const loadableIconAtom = loadable(createAssetAtom('svg', 'logo.svg'));
const transition = { duration: 0.0, ease: 'easeInOut' };

const bg = `
bg-text-base bg-opacity-0
hover:bg-opacity-10
focus:bg-opacity-20
`;

const textContrast = `text-primary text-opacity-90`;
const iconContext = {
  className: 'animate-spin-pulse text-primary -z-10 absolute',
  style: {
    top: '-1px',
    left: '-2px',
    width: '100%',
    height: '100%',
  },
};
export function IconButton() {
  const loading = useAtomValue(loadingAtom);
  const [lazyIcon] = useAtom(loadableIconAtom);
  if (lazyIcon.state === 'hasError') return <span>{lazyIcon.error}</span>;
  if (lazyIcon.state === 'loading') {
    return <span>Loading...</span>;
  }

  return (
    <button
      key="icon-button"
      tabIndex={-1}
      type="button"
      className="relative min-h-fit min-w-fit"
    >
      {/* {loading && (
        <IconContext.Provider value={iconContext}>
          <div>
            <CgSpinner />
          </div>
        </IconContext.Provider>
      )} */}
      <a
        onClick={(e) => {
          e.preventDefault();
          ipcRenderer.send(AppChannel.RUN_MAIN_SCRIPT);
        }}
        tabIndex={-1}
      >
        <svg
          className={`
        -ml-0.5
      mr-0.5 mb-0.5
      flex
      h-6

      w-6 min-w-fit
      items-center
      justify-center
      rounded
      p-1
      ${textContrast}

      ${bg}

      transition-all duration-200 ease-in-out
      `}
          xmlns="http://www.w3.org/2000/svg"
          width="32"
          height="32"
          fill="currentColor"
          viewBox="0 0 32 32"
        >
          <path
            fill="currentColor"
            d="M14 25a2 2 0 0 1 2-2h14a2 2 0 1 1 0 4H16a2 2 0 0 1-2-2ZM0 7.381c0-1.796 1.983-2.884 3.498-1.92l13.728 8.736c1.406.895 1.406 2.946 0 3.84L3.498 26.775C1.983 27.738 0 26.649 0 24.854V7.38Z"
          />
        </svg>
      </a>
    </button>
  );
}
