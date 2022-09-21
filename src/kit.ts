/* eslint-disable no-nested-ternary */
/* eslint-disable import/prefer-default-export */
/* eslint-disable @typescript-eslint/naming-convention */
/* eslint-disable no-case-declarations */
/* eslint-disable @typescript-eslint/no-use-before-define */
import { app } from 'electron';
import minimist from 'minimist';
import log from 'electron-log';
import path from 'path';
import { fork, ForkOptions } from 'child_process';
import { homedir } from 'os';

import { Channel, ProcessType } from '@johnlindquist/kit/cjs/enum';
import {
  parseScript,
  kitPath,
  kenvPath,
  mainScriptPath,
  KIT_FIRST_PATH,
  getLogFromScriptPath,
} from '@johnlindquist/kit/cjs/utils';
import { ProcessInfo } from '@johnlindquist/kit';

import { emitter, KitEvent } from './events';
import { processes } from './process';
import {
  devToolsVisible,
  hideAppIfNoWindows,
  isVisible,
  sendToPrompt,
  setScript,
} from './prompt';
import { getKitScript, isSameScript, kitState } from './state';

app.on('second-instance', async (_event, argv) => {
  const { _ } = minimist(argv);
  const [, , argScript, ...argArgs] = _;
  runPromptProcess(argScript, argArgs);
});

// process.on('unhandledRejection', (reason, p) => {
//   log.warn('Unhandled Rejection at: Promise', p, 'reason:', reason);

//   // application specific logging, throwing an error, or other logic here
// });

process.on('uncaughtException', (error) => {
  log.warn(`Uncaught Exception: ${error.message}`);
  log.warn(error);
});

emitter.on(
  KitEvent.RunPromptProcess,
  (
    scriptOrScriptAndData:
      | {
          scriptPath: string;
          args: string[];
        }
      | string
  ) => {
    const { scriptPath, args } =
      typeof scriptOrScriptAndData === 'string'
        ? {
            scriptPath: scriptOrScriptAndData,
            args: [],
          }
        : scriptOrScriptAndData;

    if (isVisible()) {
      kitState.ignoreBlur = false;
      hideAppIfNoWindows('', `run ${scriptPath}`);
    } else {
      log.info(`Show App: ${scriptPath}`);
    }
    runPromptProcess(scriptPath, args);
  }
);

emitter.on(KitEvent.RunBackgroundProcess, (scriptPath: string) => {
  runPromptProcess(scriptPath);
});

const findScript = async (scriptPath: string) => {
  if (scriptPath === mainScriptPath) {
    return getKitScript(mainScriptPath);
  }

  if (
    scriptPath.startsWith(kitPath()) &&
    !scriptPath.startsWith(kitPath('tmp'))
  ) {
    return getKitScript(scriptPath);
  }

  const script = await parseScript(scriptPath);

  return script;
};

export const runPromptProcess = async (
  promptScriptPath: string,
  args: string[] = [],
  force = false
): Promise<ProcessInfo | null> => {
  log.info(`🏃‍♀️ Run ${promptScriptPath}`);

  sendToPrompt(Channel.START, force ? kitState.scriptPath : promptScriptPath);
  // const same = processes.hidePreviousPromptProcess(promptScriptPath);
  // const same = processes.endPreviousPromptProcess(promptScriptPath);
  const same = kitState.promptCount === 0 && isSameScript(promptScriptPath);

  if (same && isVisible() && !devToolsVisible()) {
    // hideAppIfNoWindows(promptScriptPath);
    log.info(`Same shortcut pressed while process running. `);
    return null;
  }

  const processInfo = await processes.findIdlePromptProcess();
  const { pid, child } = processInfo;

  const script = await findScript(promptScriptPath);

  const status = await setScript({ ...script }, pid, force);
  if (status === 'denied') {
    log.info(
      `Another script is already controlling the UI. Denying UI control: ${path.basename(
        promptScriptPath
      )}`
    );
  }

  log.info(`${pid}: 🏎 ${promptScriptPath} `);
  processInfo.scriptPath = promptScriptPath;

  // processes.assignScriptToProcess(promptScriptPath, pid);

  child?.send({
    channel: Channel.VALUE_SUBMITTED,
    input: '',
    value: {
      script: promptScriptPath,
      args,
    },
  });

  return processes.add(ProcessType.Prompt);
};

// export const resetIdlePromptProcess = async () => {
//   const { pid } = processes.findPromptProcess();
//   processes.removeByPid(pid);
//   processes.add(ProcessType.Prompt);
// };

const KIT = kitPath();
const forkOptions: ForkOptions = {
  cwd: homedir(),
  // execPath,
  env: {
    KIT,
    KENV: kenvPath(),
    PATH: KIT_FIRST_PATH + path.delimiter + process?.env?.PATH,
  },
};

export const runScript = (...args: string[]) => {
  log.info(`Run`, ...args);

  return new Promise((resolve, reject) => {
    try {
      const child = fork(kitPath('run', 'terminal.js'), args, forkOptions);

      child.on('message', (data) => {
        const dataString = data.toString();
        log.info(args[0], dataString);
      });

      child.on('exit', () => {
        resolve('success');
      });

      child.on('error', (error: Error) => {
        reject(error);
      });
    } catch (error) {
      log.warn(`Failed to run script ${args}`);
    }
  });
};

emitter.on(KitEvent.OpenLog, async (scriptPath) => {
  const logPath = getLogFromScriptPath(scriptPath);
  await runPromptProcess(kitPath('cli/edit-file.js'), [logPath]);
});

emitter.on(KitEvent.OpenScript, async (scriptPath) => {
  await runPromptProcess(kitPath('cli/edit-file.js'), [scriptPath]);
});
