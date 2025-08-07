import type { KitPrompt } from './prompt';
import { Channel } from '@johnlindquist/kit/core/enum';
import { HideReason } from '../shared/enums';
import { getMainScriptPath } from '@johnlindquist/kit/core/utils';
import { kitState } from './state';
import { AppChannel } from '../shared/enums';
import { getAssetPath } from '../shared/assets';
import os from 'node:os';
import path from 'node:path';
import { getVersion } from './version';
import { ipcMain, shell } from 'electron';
import { KitEvent, emitter } from '../shared/events';
import { processes } from './process';
import { cliFromParams, runPromptProcess } from './kit';
import { kitPath } from '@johnlindquist/kit/core/utils';
import { app, BrowserWindow } from 'electron';
import { fileURLToPath } from 'node:url';

export function setupDevtoolsHandlers(prompt: KitPrompt) {
  prompt.window.webContents?.on('devtools-opened', () => {
    prompt.devToolsOpening = false;
    prompt.window.removeListener('blur', prompt.onBlur);
    prompt.makeWindow();
    prompt.sendToPrompt(Channel.DEV_TOOLS, true);
  });

  prompt.window.webContents?.on('devtools-closed', () => {
    prompt.logSilly('event: devtools-closed');

    if (kitState.isMac && !prompt.isWindow) {
      prompt.logInfo('👋 setPromptAlwaysOnTop: false, so makeWindow');
      prompt.makeWindow();
    } else {
      prompt.setPromptAlwaysOnTop(false);
    }

    if (prompt.scriptPath !== getMainScriptPath()) {
      prompt.maybeHide(HideReason.DevToolsClosed);
    }

    prompt.window.on('blur', prompt.onBlur);
    prompt.sendToPrompt(Channel.DEV_TOOLS, false);
  });
}

export function setupDomAndFinishLoadHandlers(prompt: KitPrompt) {
  prompt.window.webContents?.on('dom-ready', () => {
    prompt.logInfo('📦 dom-ready');
    prompt.window?.webContents?.setZoomLevel(0);
    prompt.window.webContents?.on('before-input-event', prompt.beforeInputHandler as any);
  });

  prompt.window.webContents?.once('did-finish-load', () => {
    kitState.hiddenByUser = false;
    prompt.logSilly('event: did-finish-load');
    prompt.sendToPrompt(AppChannel.APP_CONFIG as any, {
      delimiter: path.delimiter,
      sep: path.sep,
      os: os.platform(),
      isMac: os.platform().startsWith('darwin'),
      isWin: os.platform().startsWith('win'),
      isLinux: os.platform().startsWith('linux'),
      assetPath: getAssetPath(),
      version: getVersion(),
      isDark: kitState.isDark,
      searchDebounce: Boolean(kitState.kenvEnv?.KIT_SEARCH_DEBOUNCE === 'false'),
      termFont: kitState.kenvEnv?.KIT_TERM_FONT || 'monospace',
      url: kitState.url,
    });

    const user = (prompt as any).snapshot ? (prompt as any).snapshot(kitState.user) : kitState.user;
    prompt.logInfo(`did-finish-load, setting prompt user to: ${user?.login}`);
    prompt.sendToPrompt(AppChannel.USER_CHANGED, user);
    (prompt as any).setKitStateAtom?.({ isSponsor: kitState.isSponsor });
    emitter.emit(KitEvent.DID_FINISH_LOAD);

    const messagesReadyHandler = async (_event, _pid) => {
      if (!prompt.window || prompt.window.isDestroyed()) {
        prompt.logError('📬 Messages ready. Prompt window is destroyed. Not initializing');
        return;
      }
      prompt.logInfo('📬 Messages ready. ');
      prompt.window.on('blur', prompt.onBlur);

      if (prompt.initMain) prompt.initMainPrompt('messages ready');

      prompt.readyEmitter.emit('ready');
      prompt.ready = true;

      prompt.logInfo(`🚀 Prompt ready. Forcing render. ${prompt.window?.isVisible() ? 'visible' : 'hidden'}`);
      prompt.sendToPrompt(AppChannel.FORCE_RENDER, undefined);
      await prompt.window?.webContents?.executeJavaScript('console.log(document.body.offsetHeight);');
      await prompt.window?.webContents?.executeJavaScript('console.clear();');
    };

    ipcMain.once(AppChannel.MESSAGES_READY, messagesReadyHandler as any);

    if (kitState.kenvEnv?.KIT_MIC) {
      prompt.sendToPrompt(AppChannel.SET_MIC_ID, kitState.kenvEnv.KIT_MIC);
    }
    if (kitState.kenvEnv?.KIT_WEBCAM) {
      prompt.sendToPrompt(AppChannel.SET_WEBCAM_ID, kitState.kenvEnv.KIT_WEBCAM);
    }
  });

  prompt.window.webContents?.on('did-fail-load', (errorCode, errorDescription, validatedURL, isMainFrame) => {
    prompt.logError(`did-fail-load: ${errorCode} ${errorDescription} ${validatedURL} ${isMainFrame}`);
  });

  prompt.window.webContents?.on('did-stop-loading', () => {
    prompt.logInfo('did-stop-loading');
  });

  prompt.window.webContents?.on('dom-ready', () => {
    prompt.logInfo(`🍀 dom-ready on ${prompt?.scriptPath}`);
    prompt.sendToPrompt(AppChannel.SET_READY, true);
  });

  prompt.window.webContents?.on('render-process-gone', (event, details) => {
    try { processes.removeByPid(prompt.pid, 'prompt exit cleanup'); } catch { }
    prompt.sendToPrompt = (() => { }) as any;
    (prompt.window.webContents as any).send = () => { };
    prompt.logError('🫣 Render process gone...');
    prompt.logError({ event, details });
  });
}

export function setupNavigationHandlers(prompt: KitPrompt) {
  prompt.window.webContents?.on('will-navigate', async (event, navigationUrl) => {
    try {
      const url = new URL(navigationUrl);
      prompt.logInfo(`👉 Prevent navigating to ${navigationUrl}`);
      event.preventDefault();

      const pathname = url.pathname.replace('//', '');

      if (url.host === 'scriptkit.com' && url.pathname === '/api/new') {
        await cliFromParams('new-from-protocol', url.searchParams);
      } else if (url.host === 'scriptkit.com' && pathname === 'kenv') {
        const repo = url.searchParams.get('repo');
        await runPromptProcess(kitPath('cli', 'kenv-clone.js'), [repo || '']);
      } else if (url.protocol === 'kit:') {
        prompt.logInfo('Attempting to run kit protocol:', JSON.stringify(url));
        await cliFromParams(url.pathname, url.searchParams);
      } else if (url.protocol === 'submit:') {
        prompt.logInfo('Attempting to run submit protocol:', JSON.stringify(url));
        prompt.sendToPrompt(Channel.SET_SUBMIT_VALUE as any, url.pathname);
      } else if (url.protocol.startsWith('http')) {
        shell.openExternal(url.href);
      }
    } catch (e) {
      prompt.logWarn(e);
    }
  });

  prompt.window.webContents?.setWindowOpenHandler(({ url }) => {
    prompt.logInfo(`Opening ${url}`);
    if (!url.startsWith('http')) return { action: 'deny' } as any;
    shell.openExternal(url);
    return { action: 'deny' } as any;
  });
}

export function loadPromptHtml(prompt: KitPrompt) {
  prompt.logSilly('Loading prompt window html');
  if (!app.isPackaged && process.env.ELECTRON_RENDERER_URL) {
    prompt.window.loadURL(`${process.env.ELECTRON_RENDERER_URL}/index.html`);
  } else {
    prompt.window.loadFile(fileURLToPath(new URL('../renderer/index.html', import.meta.url)));
  }
}

export function setupWindowLifecycleHandlers(prompt: KitPrompt) {
  prompt.window.webContents?.on('unresponsive', () => {
    prompt.logError('Prompt window unresponsive. Reloading');
    if (prompt.window.isDestroyed()) {
      prompt.logError('Prompt window is destroyed. Not reloading');
      return;
    }
    prompt.window.webContents?.once('did-finish-load', () => {
      prompt.logInfo('Prompt window reloaded');
    });
    prompt.window.reload();
  });

  prompt.window.on('always-on-top-changed', () => prompt.logInfo('📌 always-on-top-changed'));
  prompt.window.on('minimize', () => prompt.logInfo('📌 minimize'));
  prompt.window.on('restore', () => prompt.logInfo('📌 restore'));
  prompt.window.on('maximize', () => prompt.logInfo('📌 maximize'));
  prompt.window.on('unmaximize', () => prompt.logInfo('📌 unmaximize'));
  prompt.window.on('close', () => {
    try { processes.removeByPid((prompt as any).pid, 'prompt destroy cleanup'); } catch { }
    prompt.logInfo('📌 close');
  });
  prompt.window.on('closed', () => {
    prompt.logInfo('📌 closed');
    (kitState as any).emojiActive = false;
  });
  prompt.window.webContents?.on('focus', () => {
    prompt.logInfo(' WebContents Focus');
    (prompt as any).emojiActive = false;
  });
}


