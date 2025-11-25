import path from 'node:path';
import { app, shell } from 'electron';

import { randomUUID } from 'node:crypto';
import { fork } from 'node:child_process';
import minimist from 'minimist';
import { pathExistsSync, readJson } from './cjs-exports';

import type { ProcessInfo } from '@johnlindquist/kit';
import { Channel, UI } from '@johnlindquist/kit/core/enum';
import {
  getLogFromScriptPath,
  getMainScriptPath,
  kitPath,
  parseScript,
  scriptsDbPath,
} from '@johnlindquist/kit/core/utils';
import type { Script } from '@johnlindquist/kit/types/core';

import { refreshScripts } from '@johnlindquist/kit/core/db';
import { subscribeKey } from 'valtio/utils';
import { Trigger } from '../shared/enums';
import { KitEvent, emitter } from '../shared/events';
import { createForkOptions } from './fork.options';
import { pathsAreEqual } from './helpers';
import { errorLog, kitLog as log, mainLogPath } from './logs';
import { getIdles, processes } from './process';
import { prompts } from './prompts';
import { setShortcodes } from './search';
import { getKitScript, kitCache, kitState, kitStore, sponsorCheck } from './state';
import { TrackEvent, trackEvent } from './track';
import { createRunMeta } from './script-lifecycle';

app.on('second-instance', (_event, argv) => {
  log.info('second-instance', argv);
  const { _ } = minimist(argv);
  const [, , argScript, ...argArgs] = _;

  // on windows, the protocol is passed as the argScript
  const maybeProtocol = argv?.[2];
  if (maybeProtocol?.startsWith('kit:')) {
    log.info('Detected kit: protocol:', maybeProtocol);
    app.emit('open-url', null, maybeProtocol);
  }

  if (!(argScript && pathExistsSync(argScript))) {
    log.info(`${argScript} does not exist. Ignoring.`);
    return;
  }
  runPromptProcess(argScript, argArgs, {
    force: false,
    trigger: Trigger.Kit,
    sponsorCheck: false,
  });
});

app.on('activate', async (_event, _hasVisibleWindows) => {
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
  errorLog.error(`Uncaught Exception: ${error.message}`, error);
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
          cwd?: string;
        };
      }
      | string,
  ) => {
    if (!kitState.ready) {
      log.warn('Kit not ready. Ignoring prompt process:', scriptOrScriptAndData);
      if (typeof scriptOrScriptAndData === 'object' && 'scriptPath' in scriptOrScriptAndData) {
        if (scriptOrScriptAndData.args[2].includes('Shortcut')) {
          return;
        }
        const { scriptPath, args, options } = scriptOrScriptAndData;
        if (path.basename(scriptPath) === 'info.js') {
          log.info('Opening main log:', mainLogPath);
          shell.openPath(mainLogPath);

          app.quit();
          process.exit(0);
        }
      }
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
            cwd: '',
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

    log.info('Running prompt process', { scriptPath, args, options });
    runPromptProcess(scriptPath, args, options);
  },
);

emitter.on(KitEvent.RunBackgroundProcess, (scriptPath: string) => {
  runPromptProcess(scriptPath, [], {
    force: false,
    trigger: Trigger.Background,
    sponsorCheck: false,
    cwd: '',
  });
});

export const getScriptFromDbWithFallback = async (scriptPath: string) => {
  try {
    const db = await readJson(scriptsDbPath);
    const script = db?.scripts?.find((s: Script) => s.filePath === scriptPath);
    if (script) {
      log.info(`Found script in db: ${scriptPath}`, script);
      return script;
    }
  } catch (error) {
    log.warn(error);
  }

  return await parseScript(scriptPath);
};

// TODO: Consider removing the "parseScript" and just reading from the scripts db?
const findScript = async (scriptPath: string) => {
  if (scriptPath === getMainScriptPath()) {
    log.info('findScript found main script');
    return await getKitScript(getMainScriptPath());
  }

  if (scriptPath.startsWith(kitPath()) && !scriptPath.startsWith(kitPath('tmp'))) {
    log.info('findScript found kit script');
    return await getKitScript(scriptPath);
  }

  let script = kitState.scripts.get(scriptPath);
  log.info('find script found');
  if (script) {
    return script;
  }

  log.error('find script not found', scriptPath);
  script = await parseScript(scriptPath);
  kitState.scripts.set(scriptPath, script);
  return script;
};

export const runPromptProcess = async (
  promptScriptPath: string,
  args: string[] = [],
  options: {
    force: boolean;
    trigger: Trigger;
    main?: boolean;
    headers?: Record<string, string>;
    sponsorCheck: boolean;
    cwd?: string;
  } = {
      force: false,
      trigger: Trigger.App,
      main: false,
      sponsorCheck: false,
      headers: {},
      cwd: '',
    },
): Promise<ProcessInfo | null> => {
  const chainId = Math.random().toString(36).slice(2, 10);
  const runId = randomUUID();
  if (!kitState.ready) {
    log.warn(`[SC_CHAIN ${chainId}] Kit not ready. Ignoring prompt process:`, { promptScriptPath, args, options });
    return null;
  }
  log.info(`[SC_CHAIN ${chainId}] runPromptProcess:start`, { promptScriptPath, args, options, runId });
  // log.info(`->>> Prompt script path: ${promptScriptPath}`);

  const count = prompts.getVisiblePromptCount();
  if (count >= 3 && options?.sponsorCheck) {
    const isSponsor = await sponsorCheck('Unlimited Active Prompts');
    if (!isSponsor) {
      prompts.bringAllPromptsToFront();
      return null;
    }
  }

  const isMain = options?.main || pathsAreEqual(promptScriptPath || '', getMainScriptPath());

  if (kitState.isSplashShowing) {
    emitter.emit(KitEvent.CloseSplash);
  }

  // readJson(kitPath('db', 'mainShortcuts.json'))
  //   .then(setShortcuts)
  //   .catch((error) => {});

  // If the window is already open, interrupt the process with the new script

  // TODO: Handle Schedule/Background/etc without prompts?
  // Quickly firing schedule processes would create WAY too many prompts
  const promptInfo = processes.findIdlePromptProcess();
  log.info(`[SC_CHAIN ${chainId}] pickedIdlePrompt`, {
    pid: promptInfo?.pid,
    scriptPath: promptInfo?.scriptPath,
    runId,
  });

  promptInfo.launchedFromMain = isMain;
  if (!kitState.hasOpenedMainMenu && isMain) {
    kitState.hasOpenedMainMenu = true;
  }
  const { prompt, pid, child } = promptInfo;
  log.info(`🔑🔑🔑 runPromptProcess: pid=${pid}, promptScriptPath="${promptScriptPath}", isMain=${isMain}, prompt.initMain=${prompt.initMain}, prompt.scriptPath="${prompt.scriptPath}"`);
  const runMeta = createRunMeta(pid, runId);
  promptInfo.runId = runId;
  promptInfo.runStartedAt = runMeta.startedAt;
  prompt?.setActiveRun(runMeta);

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
    log.info(`${pid}: 🏠 Main script: ${promptScriptPath}`);
    log.info(`[SC_CHAIN ${chainId}] mainInitBoundsAndShow`);
    // Initialize main menu data (cached choices, preview, etc.) for instant display
    prompt.initMain = true;
    prompt.initMainPrompt('runPromptProcess-isMain');
    prompt.initMainBounds();
    prompt.initShowPrompt();
  } else if (options.trigger === Trigger.Snippet) {
    log.info(`${pid}: 📝 Snippet trigger: Preparing prompt`);
    log.info(`[SC_CHAIN ${chainId}] snippetInitBounds`);
    // For snippets, prepare the prompt bounds but don't show it yet
    // The script will call setPromptData if it needs to show a prompt
    prompt.initBounds();
    // Don't call initShowPrompt() here - let the script decide
  } else {
    log.info(`${pid}: 🖱️ Moving prompt to mouse screen`);
    log.info(`[SC_CHAIN ${chainId}] attemptPreloadAndMoveToMouseScreen`);
    // Pre-emptively lock bounds so that debounced attemptPreload calls cannot
    // apply cached (wrong) bounds before setPromptData decides whether to defer.
    // setPromptData will either keep the lock (shouldDeferShow) or clear it.
    (prompt as any).boundsLockedForResize = true;
    prompt.attemptPreload(promptScriptPath);
    prompt.moveToMouseScreen();
  }

  log.info(`${prompt.pid} 🐣 Alive for ${prompt.lifeTime()}`);

  const idlesLength = getIdles().length;
  log.info(`🗿 ${idlesLength} idles`);

  if (isSplash && isMain) {
    log.info('💦 Splash install screen visible. Preload Main Menu...');
    try {
      prompt.scriptPath = getMainScriptPath();
      prompt.preloaded = '';
    } catch (error) {
      log.error(error);
    }
  }

  // ensureIdleProcess();

  log.info(`🏃‍♀️ Run ${promptScriptPath}`);

  // Add another to the process pool when exhausted.

  // log.info(`${pid}: 🏎 ${promptScriptPath} `);
  promptInfo.scriptPath = promptScriptPath;
  promptInfo.date = Date.now();

  trackEvent(TrackEvent.ScriptTrigger, {
    script: path.basename(promptScriptPath),
    trigger: options.trigger,
    force: options.force,
  });

  const scriptlet = kitState.scriptlets.get(promptScriptPath);
  if (scriptlet) {
    log.info('Found scriptlet', { scriptlet });
  }

  let script: Script | undefined;
  try {
    script = scriptlet || (await findScript(promptScriptPath));
    log.info(`[SC_CHAIN ${chainId}] findScript:success`, { name: script?.name, filePath: script?.filePath });
  } catch (error) {
    log.warn(`[SC_CHAIN ${chainId}] findScript:error`, error as any);
  }
  if (!script) {
    log.error(`[SC_CHAIN ${chainId}] Couldn't find script, blocking run: `, promptScriptPath);
    prompt.clearActiveRun();
    promptInfo.runId = undefined;
    promptInfo.runStartedAt = undefined;
    return null;
  }
  const visible = prompt?.isVisible();
  log.info(`${pid}: ${visible ? '👀 visible' : '🙈 not visible'} before setScript ${script?.name}`);
  log.info(`[SC_CHAIN ${chainId}] beforeSetScript`, { visible, scriptName: script?.name });

  if (visible) {
    setShortcodes(prompt, kitCache.scripts);
  }

  const status = await prompt.setScript(script, {
    pid,
    runId,
    source: 'runtime',
    force: options?.force,
  });
  log.info(`[SC_CHAIN ${chainId}] afterSetScript`, { status });
  if (status === 'denied') {
    log.info(`[SC_CHAIN ${chainId}] deniedUIControl ${path.basename(promptScriptPath)}`);
  }

  // processes.assignScriptToProcess(promptScriptPath, pid);
  // alwaysOnTop(true);
  // if (!pathsAreEqual(promptScriptPath || '', getMainScriptPath())) {
  //   log.info(`Enabling ignore blur: ${promptScriptPath}`);
  //   kitState.ignoreBlur = true;
  // }

  const argsWithTrigger = [
    ...args,
    '--trigger',
    options?.trigger ? options.trigger : 'unknown',
    '--force',
    options?.force ? 'true' : 'false',
    '--cwd',
    options?.cwd || '',
  ];

  log.info(`[SC_CHAIN ${chainId}] beforeChildSend`, { pid, promptScriptPath, argsWithTrigger });
  try {
    child?.send({
      channel: Channel.VALUE_SUBMITTED,
      input: '',
      value: {
        script: promptScriptPath,
        args: argsWithTrigger,
        trigger: options?.trigger,
        choices: scriptlet ? [scriptlet] : [],
        name: script?.name,
        headers: options?.headers,
        scriptlet,
        runId,
        runStartedAt: runMeta.startedAt,
      },
    });
    log.info(`[SC_CHAIN ${chainId}] afterChildSend:success`, { pid });
  } catch (error) {
    log.error(`[SC_CHAIN ${chainId}] afterChildSend:error`, error as any);
  }

  return promptInfo;
};

export const runScript = (...args: string[]) => {
  log.info('Run', ...args);

  return new Promise((resolve, reject) => {
    try {
      const child = fork(kitPath('run', 'terminal.js'), args, createForkOptions());

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
      errorLog.error(`Failed to run script ${args}`, error);
    }
  });
};

subscribeKey(kitState, 'isSponsor', (isSponsor) => {
  log.info('🎨 Sponsor changed:', isSponsor);

  // Sets the env var for when scripts parse to exclude main sponsor script
  runScript(kitPath('config', 'toggle-sponsor.js'), isSponsor ? 'true' : 'false');

  kitStore.set('sponsor', isSponsor);

  refreshScripts();
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
