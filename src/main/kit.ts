import { app } from 'electron';
import minimist from 'minimist';
import log from 'electron-log';
import path from 'path';
import fsExtra from 'fs-extra';
const { pathExistsSync } = fsExtra;
import { fork, ForkOptions } from 'child_process';
import { homedir } from 'os';

import { Channel, UI } from '@johnlindquist/kit/core/enum';
import {
  parseScript,
  kitPath,
  kenvPath,
  getMainScriptPath,
  KIT_FIRST_PATH,
  getLogFromScriptPath,
  execPath,
} from '@johnlindquist/kit/core/utils';
import { ProcessInfo } from '@johnlindquist/kit';

import { subscribeKey } from 'valtio/utils';
import { emitter, KitEvent } from '../shared/events';
import { ensureIdleProcess, getIdles, processes } from './process';
import {
  getKitScript,
  kitCache,
  kitState,
  kitStore,
  sponsorCheck,
} from '../shared/state';
import { pathsAreEqual } from './helpers';
import { Trigger } from '../shared/enums';
import { TrackEvent, trackEvent } from './track';
import { prompts } from './prompts';
import { setShortcodes } from './search';

app.on('second-instance', async (_event, argv) => {
  log.info('second-instance', argv);
  const { _ } = minimist(argv);
  const [, , argScript, ...argArgs] = _;

  // on windows, the protocol is passed as the argScript
  const maybeProtocol = argv?.[2];
  if (maybeProtocol?.startsWith('kit:')) {
    log.info('Detected kit: protocol:', maybeProtocol);
    app.emit('open-url', null, maybeProtocol);
  }

  if (!argScript || !pathExistsSync(argScript)) {
    log.info(`${argScript} does not exist. Ignoring.`);
    return;
  }
  runPromptProcess(argScript, argArgs, {
    force: false,
    trigger: Trigger.Kit,
    sponsorCheck: false,
  });
});

app.on('activate', async (_event, hasVisibleWindows) => {
  kitState.isActivated = true;
  runPromptProcess(getMainScriptPath(), [], {
    force: true,
    trigger: Trigger.Kit,
    sponsorCheck: false,
  });
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
          options: {
            force: boolean;
            trigger: Trigger;
          };
        }
      | string,
  ) => {
    const { scriptPath, args, options } =
      typeof scriptOrScriptAndData === 'string'
        ? {
            scriptPath: scriptOrScriptAndData,
            args: [],
            options: {
              force: false,
              trigger: Trigger.Kit,
              sponsorCheck: true,
            },
          }
        : scriptOrScriptAndData;

    // TODO: Each prompt will need its own "ignoreBlur"
    // if (isVisible()) {
    //   kitState.ignoreBlur = false;
    //   // hideAppIfNoWindows(HideReason.RunPromptProcess);
    // } else {
    //   log.info(`Show App: ${scriptPath}`);
    // }
    runPromptProcess(scriptPath, args, options);
  },
);

emitter.on(KitEvent.RunBackgroundProcess, (scriptPath: string) => {
  runPromptProcess(scriptPath, [], {
    force: false,
    trigger: Trigger.Background,
    sponsorCheck: false,
  });
});

// TODO: Consider removing the "parseScript" and just reading from the scripts db?
const findScript = async (scriptPath: string) => {
  if (scriptPath === getMainScriptPath()) {
    return getKitScript(getMainScriptPath());
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
  options: {
    force: boolean;
    trigger: Trigger;
    main?: boolean;
    sponsorCheck: boolean;
  } = {
    force: false,
    trigger: Trigger.App,
    main: false,
    sponsorCheck: false,
  },
): Promise<ProcessInfo | null> => {
  const count = prompts.getVisiblePromptCount();
  if (count >= 2 && options?.sponsorCheck) {
    const isSponsor = await sponsorCheck('More than 2 prompts');
    if (!isSponsor) {
      return null;
    }
  }

  const isMain =
    options?.main || pathsAreEqual(promptScriptPath || '', getMainScriptPath());

  emitter.emit(KitEvent.MAIN_SCRIPT_TRIGGERED);

  // readJson(kitPath('db', 'mainShortcuts.json'))
  //   .then(setShortcuts)
  //   .catch((error) => {});

  // If the window is already open, interrupt the process with the new script

  const info = processes.findIdlePromptProcess();
  info.launchedFromMain = isMain;
  const { prompt, pid, child } = info;
  const isSplash = prompt.ui === UI.splash;
  log.info(`>>>

  ${pid}:${prompt.window?.id}: 🧤 Show and focus ${promptScriptPath}

  <<<`);
  // if (options?.main) {
  //   prompt.cacheMainChoices();
  //   prompt.cacheMainPreview();
  // }

  prompt.alwaysOnTop = true;
  if (isMain) {
    prompt.initMainBounds();
    prompt.initShowPrompt();
  }

  log.info(`${prompt.pid} 🐣 Alive for ${prompt.lifeTime()}`);

  const idlesLength = getIdles().length;
  log.info(`🗿 ${idlesLength} idles`);

  if (isSplash && isMain) {
    log.info(`💦 Splash install screen visible. Preload Main Menu...`);
    try {
      prompt.scriptPath = getMainScriptPath();
      kitState.preloaded = false;
      // attemptPreload(getMainScriptPath());
    } catch (error) {
      log.error(error);
    }
  }

  ensureIdleProcess();

  log.info(`🏃‍♀️ Run ${promptScriptPath}`);

  // Add another to the process pool when exhausted.

  log.info(`${pid}: 🏎 ${promptScriptPath} `);
  info.scriptPath = promptScriptPath;
  info.date = Date.now();

  trackEvent(TrackEvent.ScriptTrigger, {
    script: path.basename(promptScriptPath),
    trigger: options.trigger,
    force: options.force,
  });

  const script = await findScript(promptScriptPath);
  const visible = prompt?.isVisible();
  log.info(
    `${pid}: Visible before setScript ${visible ? '👀' : '🙈'} ${script?.name}`,
  );

  if (visible) {
    setShortcodes(prompt, kitCache.scripts);
  }

  const status = await prompt.setScript({ ...script }, pid, options?.force);
  if (status === 'denied') {
    log.info(
      `Another script is already controlling the UI. Denying UI control: ${path.basename(
        promptScriptPath,
      )}`,
    );
  }

  // processes.assignScriptToProcess(promptScriptPath, pid);
  // alwaysOnTop(true);
  // if (!pathsAreEqual(promptScriptPath || '', getMainScriptPath())) {
  //   log.info(`Enabling ignore blur: ${promptScriptPath}`);
  //   kitState.ignoreBlur = true;
  // }

  const argsWithTrigger = [
    ...args,
    `--trigger`,
    options?.trigger ? options.trigger : 'unknown',
    '--force',
    options?.force ? 'true' : 'false',
  ];

  child?.send({
    channel: Channel.VALUE_SUBMITTED,
    input: '',
    value: {
      script: promptScriptPath,
      args: argsWithTrigger,
      trigger: options?.trigger,
    },
  });

  return info;
};

const KIT = kitPath();
const forkOptions: ForkOptions = {
  cwd: homedir(),
  execPath,
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

subscribeKey(kitState, 'isSponsor', (isSponsor) => {
  log.info(`🎨 Sponsor changed:`, isSponsor);

  // runScript(
  //   kitPath('config', 'toggle-sponsor.js'),
  //   isSponsor ? 'true' : 'false'
  // );

  kitStore.set('sponsor', isSponsor);
});

emitter.on(KitEvent.OpenLog, async (scriptPath) => {
  const logPath = getLogFromScriptPath(scriptPath);
  await runPromptProcess(kitPath('cli/edit-file.js'), [logPath], {
    force: true,
    trigger: Trigger.Kit,
    sponsorCheck: false,
  });
});

emitter.on(KitEvent.OpenScript, async (scriptPath) => {
  await runPromptProcess(kitPath('cli/edit-file.js'), [scriptPath], {
    force: true,
    trigger: Trigger.App,
    sponsorCheck: false,
  });
});

export const cliFromParams = async (cli: string, params: URLSearchParams) => {
  const name = params.get('name');
  const newUrl = params.get('url');
  if (name && newUrl) {
    await runPromptProcess(kitPath(`cli/${cli}.js`), [name, '--url', newUrl], {
      force: true,
      trigger: Trigger.Protocol,
      sponsorCheck: false,
    });
    return true;
  }

  const content = params.get('content');

  if (content) {
    await runPromptProcess(
      kitPath(`cli/${cli}.js`),
      [name || '', '--content', content],
      {
        force: true,
        trigger: Trigger.Protocol,
        sponsorCheck: false,
      },
    );
    return true;
  }
  return false;
};
