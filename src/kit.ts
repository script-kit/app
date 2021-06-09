/* eslint-disable @typescript-eslint/naming-convention */
/* eslint-disable no-case-declarations */
/* eslint-disable @typescript-eslint/no-use-before-define */
import { app } from 'electron';
import minimist from 'minimist';
import path from 'path';
import log from 'electron-log';
import { ChildProcess, fork } from 'child_process';

import { hidePromptWindow, setIgnoreBlur } from './prompt';
import { reset } from './ipc';
import { createMessageHandler } from './messages';
import { emitter, AppEvent } from './events';
import { Channel, ProcessType } from './enums';

/* eslint-disable no-nested-ternary */
/* eslint-disable import/prefer-default-export */
import {
  KIT,
  execPath,
  PATH,
  KIT_MAC_APP,
  KIT_MAC_APP_PROMPT,
  kenvPath,
  getKenv,
  getKenvDotEnv,
  mainScriptPath,
} from './helpers';

import { ProcessInfo, processes, backgroundMap } from './state';
import { getVersion } from './version';

interface CreateChildInfo {
  type: ProcessType;
  scriptPath?: string;
  runArgs?: string[];
  resolve?: (data: any) => void;
  reject?: (error: any) => void;
}

const APP_SCRIPT_TIMEOUT = 30000;
const SYSTEM_SCRIPT_TIMEOUT = 30000;
const SCHEDULE_SCRIPT_TIMEOUT = 30000;

const createChild = ({
  type,
  scriptPath = 'kit',
  runArgs = [],
  resolve,
  reject,
}: CreateChildInfo) => {
  let args = [];
  if (!scriptPath) {
    args = ['--app'];
  } else {
    let resolvePath = scriptPath.startsWith(path.sep)
      ? scriptPath
      : scriptPath.includes(path.sep)
      ? kenvPath(scriptPath)
      : kenvPath('scripts', scriptPath);

    if (!resolvePath.endsWith('.js')) resolvePath = `${resolvePath}.js`;
    args = [resolvePath, ...runArgs, '--app'];
  }

  const child = fork(KIT_MAC_APP, args, {
    silent: false,
    // stdio: 'inherit',
    execPath,
    env: {
      ...process.env,
      KIT_CONTEXT: 'app',
      KIT_MAIN: scriptPath,
      PATH,
      KENV: getKenv(),
      KIT,
      KIT_DOTENV: getKenvDotEnv(),
      KIT_APP_VERSION: getVersion(),
      PROCESS_TYPE: type,
    },
  });

  log.info(`🟢 start ${type} process: ${scriptPath} id: ${child.pid}`);

  processes.add(child, type, scriptPath);

  const { pid } = child;
  child.on('exit', () => {
    setIgnoreBlur(false);
    const { values } = processes.getByPid(pid) as ProcessInfo;
    if (resolve) {
      resolve(values);
    }
    log.info(`🟡 end ${type} process: ${scriptPath} id: ${child.pid}`);
    processes.removeByPid(pid);
  });

  child.on('error', (error) => {
    if (reject) reject(error);
  });

  return child;
};

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

// TODO: Refactor to decorating createChild
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

export const prepPromptProcess = () => {
  const promptProcess = fork(KIT_MAC_APP_PROMPT, ['--app'], {
    silent: false,
    stdio: 'inherit',
    execPath,
    env: {
      ...process.env,
      KIT_CONTEXT: 'app',
      PATH,
      KENV: getKenv(),
      KIT,
      KIT_DOTENV: getKenvDotEnv(),
      KIT_APP_VERSION: getVersion(),
    },
  });
  promptProcess?.on('message', createMessageHandler(ProcessType.Prompt));
  promptProcess.on('exit', (data) => {
    processes.ifPid(promptProcess.pid, ({ child, type, scriptPath }) => {
      log.info(
        `🟡 end ${type} process: ${scriptPath} id: ${promptProcess.pid}`
      );
      processes.removeByPid(promptProcess.pid);
    });
  });

  promptProcess.on('error', (error) => {
    log.warn(`🤕`, error);
  });

  processes.add(promptProcess, ProcessType.Prompt);
};

export const runPromptProcess = (
  promptScriptPath: string,
  args: string[] = []
) => {
  log.info(`🙏 Run ${promptScriptPath}`);
  const { child, pid } = processes.findPromptProcess();

  child?.send({
    channel: Channel.VALUE_SUBMITTED,
    value: {
      script: promptScriptPath,
      args,
    },
  });

  log.info(
    processes.map(({ scriptPath, type, pid: id }) => ({
      pid: id,
      scriptPath,
      type,
    }))
  );
  processes.patchByPid(pid, { scriptPath: promptScriptPath });

  prepPromptProcess();
};
