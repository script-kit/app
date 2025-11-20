import { Channel, UI } from '@johnlindquist/kit/core/enum';
import type { PromptData } from '@johnlindquist/kit/types/core';
import { debounce } from 'lodash-es';
import { getMainScriptPath } from '@johnlindquist/kit/core/utils';
import { AppChannel } from '../shared/enums';
import { kitState, preloadPromptDataMap } from './state';
import { setFlags } from './search';
import { createPty } from './pty';
import { applyPromptDataBounds } from './prompt.bounds-utils';

export const setPromptDataImpl = async (prompt: any, promptData: PromptData): Promise<void> => {
  prompt.promptData = promptData;

  const setPromptDataHandler = debounce(
    (_x: unknown, { ui }: { ui: UI }) => {
      prompt.logInfo(`${prompt.pid}: Received SET_PROMPT_DATA from renderer. ${ui} Ready!`);
      prompt.refocusPrompt();
    },
    100,
    {
      leading: true,
      trailing: false,
    },
  );

  prompt.window.webContents.ipc.removeHandler(Channel.SET_PROMPT_DATA);
  prompt.window.webContents.ipc.once(Channel.SET_PROMPT_DATA, setPromptDataHandler);

  if (promptData.ui === UI.term) {
    const termConfig = {
      command: (promptData as any)?.command || '',
      cwd: promptData.cwd || '',
      shell: (promptData as any)?.shell || '',
      promptId: prompt.id || '',
      env: promptData.env || {},
      args: (promptData as any)?.args || [],
      closeOnExit: typeof (promptData as any)?.closeOnExit === 'boolean' ? (promptData as any).closeOnExit : undefined,
      pid: prompt.pid,
    };
    prompt.sendToPrompt(AppChannel.SET_TERM_CONFIG, termConfig);
    createPty(prompt);
  }

  prompt.scriptPath = promptData?.scriptPath;
  prompt.clearFlagSearch();
  prompt.kitSearch.shortcodes.clear();
  prompt.kitSearch.triggers.clear();
  if (promptData?.hint) {
    for (const trigger of promptData?.hint?.match(/(?<=\[)\w+(?=\])/gi) || []) {
      prompt.kitSearch.triggers.set(trigger, { name: trigger, value: trigger });
    }
  }

  prompt.kitSearch.commandChars = promptData.inputCommandChars || [];
  prompt.updateShortcodes();

  if (prompt.cacheScriptPromptData && !promptData.preload) {
    prompt.cacheScriptPromptData = false;
    promptData.name ||= prompt.script.name || '';
    promptData.description ||= prompt.script.description || '';
    prompt.logInfo(`💝 Caching prompt data: ${prompt?.scriptPath}`);
    preloadPromptDataMap.set(prompt.scriptPath, {
      ...promptData,
      input: promptData?.keyword ? '' : promptData?.input || '',
      keyword: '',
    });
  }

  if (promptData.flags && typeof promptData.flags === 'object') {
    prompt.logInfo(`🏳️‍🌈 Setting flags from setPromptData: ${Object.keys(promptData.flags)}`);
    setFlags(prompt, promptData.flags);
  }

  kitState.hiddenByUser = false;

  if (typeof promptData?.alwaysOnTop === 'boolean') {
    prompt.logInfo(`📌 setPromptAlwaysOnTop from promptData: ${promptData.alwaysOnTop ? 'true' : 'false'}`);
    prompt.setPromptAlwaysOnTop(promptData.alwaysOnTop, true);
  }

  if (typeof promptData?.skipTaskbar === 'boolean') {
    prompt.setSkipTaskbar(promptData.skipTaskbar);
  }

  prompt.allowResize = promptData?.resize;
  kitState.shortcutsPaused = promptData.ui === UI.hotkey;

  prompt.logVerbose(`setPromptData ${promptData.scriptPath}`);

  prompt.id = promptData.id;
  prompt.ui = promptData.ui;

  if (prompt.kitSearch.keyword) {
    promptData.keyword = prompt.kitSearch.keyword || prompt.kitSearch.keyword;
  }

  // Send user data BEFORE prompt data only if we haven't bootstrapped this prompt yet
  const userSnapshot = (await import('valtio')).snapshot(kitState.user);
  prompt.logInfo(`Early user data considered: ${userSnapshot?.login || 'not logged in'}`);
  if (!(prompt as any).__userBootstrapped) {
    prompt.sendToPrompt(AppChannel.USER_CHANGED, userSnapshot);
    (prompt as any).__userBootstrapped = true;
  }
  
  prompt.sendToPrompt(Channel.SET_PROMPT_DATA, promptData);

  const isMainScript = getMainScriptPath() === promptData.scriptPath;

  if (prompt.firstPrompt && !isMainScript) {
    prompt.logInfo(`${prompt.pid} Before initBounds`);
    prompt.initBounds();
    prompt.logInfo(`${prompt.pid} After initBounds`);
    prompt.logInfo(`${prompt.pid} Disabling firstPrompt`);
    prompt.firstPrompt = false;
  }

  if (!isMainScript) {
    applyPromptDataBounds(prompt.window, promptData);
  }

  if (kitState.hasSnippet) {
    const timeout = prompt.script?.snippetdelay || 0;
    await new Promise((r) => setTimeout(r, timeout));
    kitState.hasSnippet = false;
  }

  const visible = prompt.isVisible();
  prompt.logInfo(`${prompt.id}: visible ${visible ? 'true' : 'false'} 👀`);

  const shouldShow = promptData?.show !== false;
  if (!visible && shouldShow) {
    prompt.logInfo(`${prompt.id}: Prompt not visible but should show`);
    if (!prompt.firstPrompt) {
      prompt.showPrompt();
    } else {
      prompt.showAfterNextResize = true;
    }
  } else if (visible && !shouldShow) {
    prompt.actualHide();
  }

  if (!visible && promptData?.scriptPath.includes('.md#')) {
    prompt.focusPrompt();
  }
};

