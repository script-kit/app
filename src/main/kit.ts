import path from 'node:path';
import { app } from 'electron';
import log from 'electron-log';

import minimist from 'minimist';
import { pathExistsSync, readJson } from './cjs-exports';
import { type ForkOptions, fork } from 'node:child_process';
import { homedir } from 'node:os';

import type { ProcessInfo } from '@johnlindquist/kit';
import { Channel, UI } from '@johnlindquist/kit/core/enum';
import {
  KIT_FIRST_PATH,
  execPath,
  getLogFromScriptPath,
  getMainScriptPath,
  kenvPath,
  kitPath,
  parseScript,
  scriptsDbPath,
} from '@johnlindquist/kit/core/utils';
import type { Script } from '@johnlindquist/kit/types/core';

import { subscribeKey } from 'valtio/utils';
import { Trigger } from '../shared/enums';
import { KitEvent, emitter } from '../shared/events';
import { pathsAreEqual } from './helpers';
import { getIdles, processes } from './process';
import { prompts } from './prompts';
import { setShortcodes } from './search';
import { getKitScript, kitCache, kitState, kitStore, sponsorCheck } from './state';
import { TrackEvent, trackEvent } from './track';

import { createLogger } from '../shared/log-utils';

const { info, warn, err, silly, verbose } = createLogger('kit.ts');

app.on('second-instance', (_event, argv) => {
  info('second-instance', argv);
  const { _ } = minimist(argv);
  const [, , argScript, ...argArgs] = _;

  // on windows, the protocol is passed as the argScript
  const maybeProtocol = argv?.[2];
  if (maybeProtocol?.startsWith('kit:')) {
    info('Detected kit: protocol:', maybeProtocol);
    app.emit('open-url', null, maybeProtocol);
  }

  if (!(argScript && pathExistsSync(argScript))) {
    info(`${argScript} does not exist. Ignoring.`);
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
//   warn('Unhandled Rejection at: Promise', p, 'reason:', reason);

//   // application specific logging, throwing an error, or other logic here
// });

process.on('uncaughtException', (error) => {
  warn(`Uncaught Exception: ${error.message}`);
  warn(error);
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
    if (!kitState.ready) {
      warn('Kit not ready. Ignoring prompt process:', scriptOrScriptAndData);
      return;
    }
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
    //   info(`Show App: ${scriptPath}`);
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

export const getScriptFromDbWithFallback = async (scriptPath: string) => {
  try {
    const db = await readJson(scriptsDbPath);
    const script = db?.scripts?.find((s: Script) => s.filePath === scriptPath);
    if (script) {
      info(`Found script in db: ${scriptPath}`, script);
      return script;
    }
  } catch (error) {
    warn(error);
  }

  return await parseScript(scriptPath);
};

// TODO: Consider removing the "parseScript" and just reading from the scripts db?
const findScript = async (scriptPath: string) => {
  if (scriptPath === getMainScriptPath()) {
    info('findScript found main script');
    return await getKitScript(getMainScriptPath());
  }

  if (scriptPath.startsWith(kitPath()) && !scriptPath.startsWith(kitPath('tmp'))) {
    info('findScript found kit script');
    return await getKitScript(scriptPath);
  }

  const script = kitState.scripts.get(scriptPath);
  info('find script found');
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
  // info(`->>> Prompt script path: ${promptScriptPath}`);

  const count = prompts.getVisiblePromptCount();
  if (count >= 2 && options?.sponsorCheck) {
    const isSponsor = await sponsorCheck('More than 2 prompts');
    if (!isSponsor) {
      prompts.bringAllPromptsToFront();
      return null;
    }
  }

  const isMain = options?.main || pathsAreEqual(promptScriptPath || '', getMainScriptPath());

  emitter.emit(KitEvent.MAIN_SCRIPT_TRIGGERED);

  // readJson(kitPath('db', 'mainShortcuts.json'))
  //   .then(setShortcuts)
  //   .catch((error) => {});

  // If the window is already open, interrupt the process with the new script

  // TODO: Handle Schedule/Background/etc without prompts?
  // Quickly firing schedule processes would create WAY too many prompts
  const promptInfo = processes.findIdlePromptProcess();

  promptInfo.launchedFromMain = isMain;
  if (!kitState.hasOpenedMainMenu && isMain) {
    kitState.hasOpenedMainMenu = true;
  }
  const { prompt, pid, child } = promptInfo;
  const isSplash = prompt.ui === UI.splash;
  info(`>>>

  ${pid}:${prompt.window?.id}: 🧤 Show and focus ${promptScriptPath}

  <<<`);
  // if (options?.main) {
  //   prompt.cacheMainChoices();
  //   prompt.cacheMainPreview();
  // }

  prompt.alwaysOnTop = true;
  if (isMain) {
    info(`${pid}: 🏠 Main script: ${promptScriptPath}`);
    prompt.initMainBounds();
    prompt.initShowPrompt();
  }

  info(`${prompt.pid} 🐣 Alive for ${prompt.lifeTime()}`);

  const idlesLength = getIdles().length;
  info(`🗿 ${idlesLength} idles`);

  if (isSplash && isMain) {
    info('💦 Splash install screen visible. Preload Main Menu...');
    try {
      prompt.scriptPath = getMainScriptPath();
      prompt.preloaded = '';
    } catch (error) {
      err(error);
    }
  }

  // ensureIdleProcess();

  info(`🏃‍♀️ Run ${promptScriptPath}`);

  // Add another to the process pool when exhausted.

  // info(`${pid}: 🏎 ${promptScriptPath} `);
  promptInfo.scriptPath = promptScriptPath;
  promptInfo.date = Date.now();

  trackEvent(TrackEvent.ScriptTrigger, {
    script: path.basename(promptScriptPath),
    trigger: options.trigger,
    force: options.force,
  });

  const scriptlet = kitState.scriptlets.get(promptScriptPath);

  const script = scriptlet || (await findScript(promptScriptPath));
  const visible = prompt?.isVisible();
  info(`${pid}: ${visible ? '👀 visible' : '🙈 not visible'} before setScript ${script?.name}`);

  if (visible) {
    setShortcodes(prompt, kitCache.scripts);
  }

  const status = await prompt.setScript(script, pid, options?.force);
  if (status === 'denied') {
    info(`Another script is already controlling the UI. Denying UI control: ${path.basename(promptScriptPath)}`);
  }

  // processes.assignScriptToProcess(promptScriptPath, pid);
  // alwaysOnTop(true);
  // if (!pathsAreEqual(promptScriptPath || '', getMainScriptPath())) {
  //   info(`Enabling ignore blur: ${promptScriptPath}`);
  //   kitState.ignoreBlur = true;
  // }

  const argsWithTrigger = [
    ...args,
    '--trigger',
    options?.trigger ? options.trigger : 'unknown',
    '--force',
    options?.force ? 'true' : 'false',
  ];

  info(`${pid}: 🚀 Send ${promptScriptPath}`);
  child?.send({
    channel: Channel.VALUE_SUBMITTED,
    input: '',
    value: {
      script: promptScriptPath,
      args: argsWithTrigger,
      trigger: options?.trigger,
      choices: scriptlet ? [scriptlet] : [],
      name: script?.name,
      scriptlet,
    },
  });

  return promptInfo;
};

const KIT = kitPath();
const forkOptions: ForkOptions = {
  cwd: homedir(),
  execPath,
  detached: true,
  windowsHide: true,
  env: {
    KIT,
    KENV: kenvPath(),
    PATH: KIT_FIRST_PATH + path.delimiter + process?.env?.PATH,
  },
};

export const runScript = (...args: string[]) => {
  info('Run', ...args);

  return new Promise((resolve, reject) => {
    try {
      const child = fork(kitPath('run', 'terminal.js'), args, forkOptions);

      child.on('message', (data) => {
        const dataString = data.toString();
        info(args[0], dataString);
      });

      child.on('exit', () => {
        resolve('success');
      });

      child.on('error', (error: Error) => {
        reject(error);
      });
    } catch (error) {
      warn(`Failed to run script ${args}`);
    }
  });
};

subscribeKey(kitState, 'isSponsor', (isSponsor) => {
  info('🎨 Sponsor changed:', isSponsor);

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
    await runPromptProcess(kitPath(`cli/${cli}.js`), [name || '', '--content', content], {
      force: true,
      trigger: Trigger.Protocol,
      sponsorCheck: false,
    });
    return true;
  }
  return false;
};
