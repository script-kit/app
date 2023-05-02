import { UI } from '@johnlindquist/kit/cjs/enum';
import { useAtom } from 'jotai';

import { useHotkeys } from 'react-hotkeys-hook';
import {
  flagValueAtom,
  _index,
  openAtom,
  prevIndexAtom,
  prevInputAtom,
  _input,
  isReadyAtom,
  escapeAtom,
  uiAtom,
  runMainScriptAtom,
  shortcutsAtom,
  promptDataAtom,
  runningAtom,
  logAtom,
  submittedAtom,
  scriptAtom,
  channelAtom,
  isMainScriptAtom,
} from '../jotai';
import { hotkeysOptions } from './shared';
import { AppChannel } from '../enums';

export default () => {
  const [open] = useAtom(openAtom);
  const [sendEscape] = useAtom(escapeAtom);
  const [isReady] = useAtom(isReadyAtom);
  const [flagValue, setFlagValue] = useAtom(flagValueAtom);
  const [input] = useAtom(_input);
  const [prevInput] = useAtom(prevInputAtom);

  const [index] = useAtom(_index);
  const [prevIndex] = useAtom(prevIndexAtom);
  const [ui] = useAtom(uiAtom);
  const [runMainScript] = useAtom(runMainScriptAtom);
  const [shortcuts] = useAtom(shortcutsAtom);
  const [script] = useAtom(scriptAtom);
  const [promptData] = useAtom(promptDataAtom);
  const [, setRunning] = useAtom(runningAtom);
  const [log] = useAtom(logAtom);
  const [submitted, setSubmitted] = useAtom(submittedAtom);
  const [channel] = useAtom(channelAtom);
  const [isMainScript] = useAtom(isMainScriptAtom);

  useHotkeys(
    'escape',
    (event) => {
      event.preventDefault();
      if (
        script?.filePath !== promptData?.scriptPath ||
        (isMainScript && !input && !flagValue)
      ) {
        channel(AppChannel.END_PROCESS);
        return;
      }

      if (shortcuts?.find((s) => s.key === 'escape')) return;

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
    ]
  );
};
