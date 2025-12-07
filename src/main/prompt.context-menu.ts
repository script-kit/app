import type { BrowserWindow } from 'electron';
import contextMenu from 'electron-context-menu';
import { promptLog as log } from './logs';
import { prompts } from './prompts';
import type { IPromptContext } from './prompt.types';

export const setupPromptContextMenu = (): void => {
  // TODO: Hack context menu to avoid "object destroyed" errors
  contextMenu({
    showInspectElement: true,
    showSearchWithGoogle: false,
    showLookUpSelection: false,
    append: (_defaultActions, _params, browserWindow) => {
      const actions: any[] = [];

      // Add window mode toggle if we have a valid browser window
      if (browserWindow && 'id' in browserWindow && typeof (browserWindow as BrowserWindow).id === 'number') {
        const bw = browserWindow as BrowserWindow;
        const prompt = prompts.find((p) => p?.window?.id === bw.id);
        if (prompt) {
          const ctx = prompt as IPromptContext;
          const isStandard = ctx.windowMode === 'window';
          actions.push({
            label: isStandard ? 'Convert to Panel (Attach)' : 'Convert to Window (Detach)',
            click: async () => {
              log.info(`Toggling window mode for prompt ${bw.id}`);
              await ctx.toggleWindowMode();
            },
          });
        }
      }

      actions.push(
        {
          label: 'Detach Dev Tools',
          click: async () => {
            if (browserWindow && 'id' in browserWindow && typeof (browserWindow as BrowserWindow).id === 'number') {
              const bw = browserWindow as BrowserWindow;
              log.info(`Inspect prompt: ${bw.id}`, { browserWindow });
              const prompt = prompts.find((p) => p?.window?.id === bw.id);
              if (prompt) {
                prompt.devToolsOpening = true;
                setTimeout(() => {
                  prompt.devToolsOpening = false;
                }, 200);
                prompt.window?.webContents?.openDevTools({ mode: 'detach' });
              }
            }
          },
        },
        {
          label: 'Close',
          click: async () => {
            if (browserWindow && 'id' in browserWindow && typeof (browserWindow as BrowserWindow).id === 'number') {
              const bw = browserWindow as BrowserWindow;
              log.info(`Close prompt: ${bw.id}`, { browserWindow });
              prompts.find((prompt) => prompt?.window?.id === bw.id)?.close('detach dev tools');
            }
          },
        },
      );

      return actions;
    },
  });
};
