/* eslint-disable @typescript-eslint/naming-convention */
/* eslint-disable no-case-declarations */
/* eslint-disable @typescript-eslint/no-use-before-define */
import { app } from 'electron';
import minimist from 'minimist';

import log from 'electron-log';
import { ChildProcess } from 'child_process';
import { hidePromptWindow } from './prompt';
import { createChild } from './run';
import { reset } from './ipc';
import { createMessageHandler } from './messages';
import { emitter, AppEvent } from './events';
import { mainScriptPath } from './helpers';
import { ProcessType } from './enums';
import { backgroundMap } from './state';

const APP_SCRIPT_TIMEOUT = 30000;
const SYSTEM_SCRIPT_TIMEOUT = 10000;

app.on('second-instance', async (_event, argv) => {
  const { _ } = minimist(argv);
  const [, , argScript, ...argArgs] = _;
  await tryPromptScript(argScript, argArgs);
});

process.on('unhandledRejection', (reason, p) => {
  log.warn('Unhandled Rejection at: Promise', p, 'reason:', reason);

  // application specific logging, throwing an error, or other logic here
});

process.on('uncaughtException', (error) => {
  log.warn(`Uncaught Exception: ${error.message}`);
  log.warn(error);
});

export const appScript = async (scriptPath: string, runArgs: string[]) => {
  const child = createChild({
    type: ProcessType.App,
    scriptPath,
    runArgs,
  });

  const id = setTimeout(() => {
    log.info(
      `> ${ProcessType.App} process: ${scriptPath} took > ${
        APP_SCRIPT_TIMEOUT / 1000
      } seconds. Ending...`
    );
    child?.kill();
  }, APP_SCRIPT_TIMEOUT);

  child?.on('message', createMessageHandler(ProcessType.App));

  child?.on('exit', () => {
    if (id) clearTimeout(id);
  });

  return child;
};

const promptScript = (
  scriptPath: string,
  runArgs: string[] = [],
  resolve: any,
  reject: any
) => {
  reset();
  // eslint-disable-next-line no-nested-ternary

  const child: ChildProcess = createChild({
    type: ProcessType.Prompt,
    scriptPath,
    runArgs,
    resolve,
    reject,
  });

  const tryClean = (on: string) => () => {
    try {
      reset();
      hidePromptWindow();
    } catch (error) {
      log.warn(`Error: ${error.message}`);
      log.warn(error);
    }
  };

  child.on('message', createMessageHandler(ProcessType.Prompt));
  child.on('exit', tryClean('EXIT'));
  child.on('error', tryClean('EXIT'));

  return child;
};

export const tryPromptScript = async (
  filePath: string,
  runArgs: string[] = []
) => {
  log.info(
    `
*** ${filePath} ${runArgs} ***`.trim()
  );
  try {
    return await new Promise((resolve, reject) => {
      promptScript(filePath, runArgs, resolve, reject);
    });
  } catch (error) {
    log.error(error);
    return Promise.resolve(error);
  }
};

export const runSystemScript = (scriptPath: string) => {
  const child = createChild({
    type: ProcessType.System,
    scriptPath,
    runArgs: [],
  });

  const id = setTimeout(() => {
    log.info(
      `⚠️ ${ProcessType.System} process took > ${
        SYSTEM_SCRIPT_TIMEOUT / 1000
      } seconds. Ending... ${scriptPath}`
    );
    child?.kill();
  }, SYSTEM_SCRIPT_TIMEOUT);

  child?.on('message', createMessageHandler(ProcessType.System));

  child?.on('exit', () => {
    if (id) clearTimeout(id);
  });

  return child;
};

const SCHEDULE_SCRIPT_TIMEOUT = 10000;

export const runScheduleScript = (scriptPath: string) => {
  const child = createChild({
    type: ProcessType.Schedule,
    scriptPath,
    runArgs: [],
  });

  const id = setTimeout(() => {
    log.info(
      `⚠️ ${ProcessType.Schedule} process took > ${
        SCHEDULE_SCRIPT_TIMEOUT / 1000
      } seconds. Ending... ${scriptPath}`
    );
    child?.kill();
  }, SCHEDULE_SCRIPT_TIMEOUT);

  child?.on('message', createMessageHandler(ProcessType.Schedule));

  child?.on('exit', () => {
    if (id) clearTimeout(id);
  });

  return child;
};

// never times out
export const runBackgroundScript = (scriptPath: string, runArgs: string[]) => {
  const child = createChild({
    type: ProcessType.Background,
    scriptPath,
    runArgs,
  });

  const pid = child?.pid;
  child?.on('exit', () => {
    if (backgroundMap.get(scriptPath)?.child?.pid === pid) {
      backgroundMap.delete(scriptPath);
    }
  });

  child?.on('message', createMessageHandler(ProcessType.Background));

  return child;
};

export const runWatchScript = (scriptPath: string) => {
  const child = createChild({
    type: ProcessType.Watch,
    scriptPath,
    runArgs: [],
  });

  return child;
};

emitter.on(AppEvent.TRY_PROMPT_SCRIPT, ({ filePath, runArgs }) =>
  tryPromptScript(filePath, runArgs)
);

emitter.on(AppEvent.SET_KENV, async () => {
  await tryPromptScript(mainScriptPath);
});
