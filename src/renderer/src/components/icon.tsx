import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import { loadable } from 'jotai/utils';
import type React from 'react';
import { useCallback } from 'react';

import {
  createAssetAtom,
  actionsConfigAtom,
  isMainScriptAtom,
  runMainScriptAtom,
  sendActionAtom,
  flaggedChoiceValueAtom,
  uiAtom,
} from '../jotai';

import { createLogger } from '../../../shared/log-utils';
import { useState } from 'react';
import { UI } from '@johnlindquist/kit/core/enum';

const log = createLogger('icon.tsx');

const loadableIconAtom = loadable(createAssetAtom('svg', 'logo.svg'));
const transition = { duration: 0.0, ease: 'easeInOut' };

const bg = `
bg-text-base bg-opacity-0
hover:bg-opacity-10
focus:bg-opacity-20
`;

const textContrast = 'text-primary text-opacity-90';
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
  const [lazyIcon] = useAtom(loadableIconAtom);
  const isMainScript = useAtomValue(isMainScriptAtom);
  const runMainProcess = useAtomValue(runMainScriptAtom);
  const sendAction = useSetAtom(sendActionAtom);
  const [flagValue, setFlagValue] = useAtom(flaggedChoiceValueAtom);
  const flagsOptions = useAtomValue(actionsConfigAtom);
  const [isMouseDown, setIsMouseDown] = useState(false);
  const [ui] = useAtom(uiAtom);

  const isActionActive = flagValue && flagsOptions?.active === 'Script Kit Support';

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      if (ui === UI.splash) {
        return;
      }

      log.info({
        isMainScript,
        flagValue,
      });
      if (isMainScript) {
        if (flagValue) {
          setFlagValue('');
        } else {
          sendAction({ name: 'Support' });
        }
      } else {
        runMainProcess();
      }
    },
    [isMainScript, flagValue, setFlagValue, sendAction, runMainProcess, ui],
  );

  if (lazyIcon.state === 'hasError') {
    return <span>{lazyIcon.error}</span>;
  }
  if (lazyIcon.state === 'loading') {
    return <span>Loading...</span>;
  }

  return (
    <button key="icon-button" tabIndex={-1} type="button" className="relative min-h-fit min-w-fit">
      {/* {loading && (
        <IconContext.Provider value={iconContext}>
          <div>
            <CgSpinner />
          </div>
        </IconContext.Provider>
      )} */}
      <a
        onMouseDown={() => setIsMouseDown(true)}
        onMouseUp={() => setIsMouseDown(false)}
        onClick={handleClick}
        tabIndex={-1}
      >
        <svg
          className={`
        -ml-2
      mr-0.5 mb-0.5
      flex
      h-6

      w-6 min-w-fit
      items-center
      justify-center
      rounded
      py-1
      px-1.5
      ${isMouseDown ? 'hover:bg-opacity-20' : ''}
      ${textContrast}

      ${bg}

      transition-all duration-200 ease-in-out
  ${isActionActive ? 'bg-opacity-10' : ''}

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
