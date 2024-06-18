import { UI } from '@johnlindquist/kit/core/enum';
import { useAtom } from 'jotai';

import { useHotkeys } from 'react-hotkeys-hook';
import { AppChannel } from '../../../shared/enums';
import {
  _inputAtom,
  channelAtom,
  escapeAtom,
  flaggedChoiceValueAtom,
  indexAtom,
  isMainScriptAtom,
  isReadyAtom,
  openAtom,
  promptDataAtom,
  runMainScriptAtom,
  runningAtom,
  scriptAtom,
  shortcutsAtom,
  submittedAtom,
  uiAtom,
} from '../jotai';
import { hotkeysOptions } from './shared';

export default () => {
  const [open] = useAtom(openAtom);
  const [sendEscape] = useAtom(escapeAtom);
  const [isReady] = useAtom(isReadyAtom);
  const [flagValue, setFlagValue] = useAtom(flaggedChoiceValueAtom);
  const [input] = useAtom(_inputAtom);

  const [index] = useAtom(indexAtom);
  const [ui] = useAtom(uiAtom);
  const [runMainScript] = useAtom(runMainScriptAtom);
  const [shortcuts] = useAtom(shortcutsAtom);
  const [script] = useAtom(scriptAtom);
  const [promptData] = useAtom(promptDataAtom);
  const [, setRunning] = useAtom(runningAtom);
  const [submitted] = useAtom(submittedAtom);
  const [channel] = useAtom(channelAtom);
  const [isMainScript] = useAtom(isMainScriptAtom);

  useHotkeys(
    'escape',
    (event) => {
      event.preventDefault();
      if (script?.filePath !== promptData?.scriptPath || (isMainScript && !input && !flagValue)) {
        channel(AppChannel.END_PROCESS);
        return;
      }

      if (shortcuts?.find((s) => s.key === 'escape') && !flagValue) {
        return;
      }

      if (flagValue) {
        setFlagValue('');
      } else if (isReady && ui === UI.splash) {
        runMainScript();
      } else if (isReady || ui !== UI.splash) {
        sendEscape();
        setRunning(false);
      }
    },
    hotkeysOptions,
    [
      open,
      flagValue,
      index,
      input,
      isReady,
      ui,
      runMainScript,
      shortcuts,
      promptData,
      script,
      submitted,
      channel,
      isMainScript,
    ],
  );
};
