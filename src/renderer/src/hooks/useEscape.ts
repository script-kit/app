import { UI } from '@johnlindquist/kit/core/enum';
import { useAtom } from 'jotai';

import { useHotkeys } from 'react-hotkeys-hook';
import {
  escapeAtom,
  flaggedChoiceValueAtom,
  isReadyAtom,
  promptDataAtom,
  runMainScriptAtom,
  runningAtom,
  scriptAtom,
  shortcutsAtom,
  uiAtom,
} from '../jotai';
import { hotkeysOptions } from './shared';
import { createLogger } from '../../../shared/log-utils';

const log = createLogger('useEscape.ts');

export default () => {
  const [sendEscape] = useAtom(escapeAtom);
  const [isReady] = useAtom(isReadyAtom);
  const [flagValue, setFlagValue] = useAtom(flaggedChoiceValueAtom);

  const [ui] = useAtom(uiAtom);
  const [runMainScript] = useAtom(runMainScriptAtom);
  const [shortcuts] = useAtom(shortcutsAtom);
  const [script] = useAtom(scriptAtom);
  const [promptData] = useAtom(promptDataAtom);
  const [, setRunning] = useAtom(runningAtom);

  useHotkeys(
    'escape',
    (event) => {
      log.info('Pressed escape!', {
        script: script?.filePath,
        promptData: promptData?.scriptPath,
        flagValue,
      });
      event.preventDefault();
      if (shortcuts?.find((s) => s.key === 'escape') && !flagValue) {
        log.info(`Ignoring escape because of shortcut ${shortcuts?.find((s) => s.key === 'escape')}`);
        return;
      }

      if (flagValue) {
        log.info(`Resetting flag value ${flagValue}`);
        setFlagValue('');
        return;
      }
      if (isReady && ui === UI.splash) {
        log.info(`Running main script ${script?.filePath}`);
        runMainScript();
        return;
      }

      if (isReady || ui !== UI.splash) {
        log.info(`Sending escape for ${script?.filePath}`);
        sendEscape();
        setRunning(false);
        return;
      }

      log.info(`No action for escape ${script?.filePath}...`);
    },
    hotkeysOptions,
    [
      flagValue,
      isReady,
      ui,
      runMainScript,
      shortcuts,
      promptData,
      script,
    ],
  );
};
