import { UI } from '@johnlindquist/kit/core/enum';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';

import { useHotkeys } from 'react-hotkeys-hook';
import {
  escapeAtom,
  actionsOverlayOpenAtom,
  closeActionsOverlayAtom,
  isReadyAtom,
  promptDataAtom,
  runMainScriptAtom,
  runningAtom,
  scriptAtom,
  shortcutsAtom,
  uiAtom,
} from '../jotai';

import { createLogger } from '../log-utils';

const log = createLogger('useEscape.ts');

export default () => {
  const [sendEscape] = useAtom(escapeAtom);
  const [isReady] = useAtom(isReadyAtom);
  const overlayOpen = useAtomValue(actionsOverlayOpenAtom);
  const closeOverlay = useSetAtom(closeActionsOverlayAtom);

  const [ui] = useAtom(uiAtom);
  const [runMainScript] = useAtom(runMainScriptAtom);
  const [shortcuts] = useAtom(shortcutsAtom);
  const [script] = useAtom(scriptAtom);
  const [promptData] = useAtom(promptDataAtom);
  const [, setRunning] = useAtom(runningAtom);

  useHotkeys(
    'escape',
    (_event) => {
      log.info('Pressed escape!', {
        script: script?.script?.filePath,
        promptData: promptData?.scriptPath,
        overlayOpen,
      });
      if (shortcuts?.find((s) => s.key === 'escape') && !overlayOpen) {
        log.info(`Ignoring escape because of shortcut ${shortcuts?.find((s) => s.key === 'escape')}`);
        return;
      }

      if (overlayOpen) {
        log.info(`Closing actions overlay`);
        closeOverlay();
        return;
      }
      if (isReady && ui === UI.splash) {
        log.info(`Running main script ${script?.script?.filePath}`);
        runMainScript();
        return;
      }

      if (isReady || ui !== UI.splash) {
        log.info(`Sending escape for ${script?.script?.filePath}`);
        sendEscape();
        setRunning(false);
        return;
      }

      log.info(`No action for escape ${script?.script?.filePath}...`);
    },
    {
      enabled: true,
      enableOnFormTags: ['input', 'textarea', 'select'],
      keydown: true,
      ignoreModifiers: true,
      preventDefault: true,
      scopes: 'global',
    },
    [overlayOpen, isReady, ui, runMainScript, shortcuts, promptData, script, closeOverlay],
  );
};
