/* eslint-disable jsx-a11y/anchor-is-valid */
/* eslint-disable jsx-a11y/no-static-element-interactions */
/* eslint-disable jsx-a11y/click-events-have-key-events */
/* eslint-disable react/jsx-props-no-spreading */
import { useAtomValue, useAtom } from 'jotai';
import { UI } from '@johnlindquist/kit/core/enum';
import { IconButton } from './icon';
import { ActionButton } from './actionbutton';
import { EnterButton } from './actionenterbutton';
import {
  flagsAtom,
  footerAtom,
  uiAtom,
  enterButtonNameAtom,
  enterButtonDisabledAtom,
  actionsAtom,
  appConfigAtom,
  lightenUIAtom,
  focusedChoiceAtom,
  shortcutsAtom,
  hasRightShortcutAtom,
} from '../jotai';

import { Action, textContrast } from './actions';
import { ActionSeparator } from './actionseparator';
import { OptionsButton } from './actionoptionsbutton';

export default function ActionBar() {
  const [flags] = useAtom(flagsAtom);
  const [footer] = useAtom(footerAtom);

  const [enterButtonName] = useAtom(enterButtonNameAtom);
  const [enterButtonDisabled] = useAtom(enterButtonDisabledAtom);
  const [ui] = useAtom(uiAtom);
  const [app] = useAtom(appConfigAtom);
  const m = app?.isMac;
  const lightenUI = useAtomValue(lightenUIAtom);

  const _actions: Action[] = useAtomValue(actionsAtom);
  const focusedChoice = useAtomValue(focusedChoiceAtom);
  const shortcuts = useAtomValue(shortcutsAtom);
  const hasRightShortcut = useAtomValue(hasRightShortcutAtom);

  const hasFlags =
    Object.keys(flags)?.length > 0 &&
    !focusedChoice?.ignoreFlags &&
    !hasRightShortcut;

  const actions = focusedChoice?.ignoreFlags ? [] : _actions;

  return (
    <div
      className={`
      flex flex-row
      ${ui === UI.splash ? `` : `border-t border-ui-border bg-ui-bg`}
    min-h-7 h-7 max-h-7
    items-center justify-center
    overflow-hidden px-4 py-px
    ${lightenUI && `lighten`}
    `}
    >
      <IconButton />

      <div
        className={`left-container flex flex-row items-center justify-center ${
          !m ? `pb-2px` : `pb-px`
        }`}
      >
        {actions
          .filter((action) => action.position === 'left')
          .flatMap((action, i, array) => [
            // eslint-disable-next-line react/jsx-key
            <ActionButton {...action} />,
            i < array.length - 1 ? (
              <ActionSeparator key={`${action?.key}-separator`} />
            ) : null,
            i === array.length - 1 && footer?.length ? (
              <ActionSeparator key={`${action?.key}-separator`} />
            ) : null,
          ])}
      </div>
      {footer?.length ? (
        <div
          className={`justify-left flex h-full max-h-full
        flex-1
        items-center px-2
text-sm font-medium
${textContrast}
truncate
text-opacity-75
      `}
        >
          <div
            className="min-w-0 truncate pb-px"
            dangerouslySetInnerHTML={{ __html: footer }}
          />
        </div>
      ) : (
        <div className="max-h-full flex-1" />
      )}

      <div
        className={`justify-center right-container flex flex-row items-center ${
          !m ? `pb-2px` : `pb-px`
        } overflow-hidden`}
      >
        <div className="options-container flex flex-row">
          {hasFlags && [
            <OptionsButton key="options-button" />,
            <ActionSeparator key="options-separator" />,
          ]}
        </div>
        <div className="flex flex-grow-0 flex-row items-center overflow-hidden">
          {actions
            .filter((action) => action.position === 'right')
            .flatMap((action, i, array) => [
              // eslint-disable-next-line react/jsx-key
              <ActionButton {...action} />,
              // eslint-disable-next-line no-nested-ternary
              i < array.length - 1 ? (
                <ActionSeparator key={`${action?.key}-separator`} />
              ) : enterButtonName ? (
                <ActionSeparator key={`${action?.key}-separator`} />
              ) : null,
            ])}
        </div>
        <div className="enter-container flex min-w-fit flex-row items-center">
          {enterButtonName ? (
            <EnterButton
              key="enter-button"
              name={enterButtonName}
              position="right"
              shortcut="⏎"
              value="enter"
              flag=""
              disabled={enterButtonDisabled}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}
