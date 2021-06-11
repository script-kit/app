/* eslint-disable no-nested-ternary */
/* eslint-disable import/prefer-default-export */
/* eslint-disable @typescript-eslint/naming-convention */
/* eslint-disable no-case-declarations */
/* eslint-disable @typescript-eslint/no-use-before-define */
import { app } from 'electron';
import minimist from 'minimist';
import log from 'electron-log';

import { emitter, KitEvent } from './events';
import { Channel, ProcessType } from './enums';

import { mainScriptPath } from './helpers';

import { processes } from './process';
import { setPromptPid, setScript } from './prompt';
import { getKitScript, getScript } from './state';

app.on('second-instance', async (_event, argv) => {
  const { _ } = minimist(argv);
  const [, , argScript, ...argArgs] = _;
  processes.add(ProcessType.Background, argScript, argArgs);
});

process.on('unhandledRejection', (reason, p) => {
  log.warn('Unhandled Rejection at: Promise', p, 'reason:', reason);

  // application specific logging, throwing an error, or other logic here
});

process.on('uncaughtException', (error) => {
  log.warn(`Uncaught Exception: ${error.message}`);
  log.warn(error);
});

emitter.on(KitEvent.SetKenv, () => {
  runPromptProcess(mainScriptPath);
});

export const runPromptProcess = (
  promptScriptPath: string,
  args: string[] = []
) => {
  processes.endPreviousPromptProcess();

  const script =
    promptScriptPath === mainScriptPath
      ? getKitScript(mainScriptPath)
      : getScript(promptScriptPath);

  setScript(script);

  log.info(processes.getAllProcessInfo());
  const { child, pid } = processes.findPromptProcess();

  child?.send({
    channel: Channel.VALUE_SUBMITTED,
    value: {
      script: promptScriptPath,
      args,
    },
  });

  setPromptPid(pid);
  processes.assignScriptToProcess(promptScriptPath, pid);
  processes.add(ProcessType.Prompt);
};
