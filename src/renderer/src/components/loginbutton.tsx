/* eslint-disable jsx-a11y/anchor-is-valid */
/* eslint-disable jsx-a11y/no-static-element-interactions */
/* eslint-disable jsx-a11y/click-events-have-key-events */
/* eslint-disable react/jsx-props-no-spreading */
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import { useCallback } from 'react';
import { appConfigAtom, channelAtom, sendShortcutAtom, signInActionAtom } from '../jotai';
import { bg, textContrast } from './actions';
import { GithubIcon } from './icons';
import { Channel, Mode, PROMPT, UI } from '@johnlindquist/kit/core/enum';

export function LoginButton() {
  const sendShortcut = useSetAtom(sendShortcutAtom);
  const [app] = useAtom(appConfigAtom);
  const action = useAtomValue(signInActionAtom);
  const channel = useAtomValue(channelAtom);

  const onClick = useCallback(
    (event) => {
      if (action) {
        channel(Channel.ACTION, { action });
      }
    },
    [action, sendShortcut],
  );

  return (
    // eslint-disable-next-line jsx-a11y/mouse-events-have-key-events
    // biome-ignore lint/a11y/useKeyWithMouseEvents: <explanation>
    <button
      type="button"
      tabIndex={-1}
      className={`
  flex h-6 flex-row
  items-center
  justify-center rounded
  px-1
  -mt-[1px]

  text-sm

  font-medium
  text-primary text-opacity-25 outline-none
  transition-opacity duration-200 ease-out ${bg}  ${textContrast}`}
      onClick={onClick}
      // blur on mouse down
      onMouseOut={(e) => e.currentTarget.blur()}
    >
      <GithubIcon className="mb-[1px]" />
    </button>
  );
}
