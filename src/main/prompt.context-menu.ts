import { BrowserWindow } from 'electron';
import contextMenu from 'electron-context-menu';
import { promptLog as log } from './logs';
import { prompts } from './prompts';

export const setupPromptContextMenu = (): void => {
    // TODO: Hack context menu to avoid "object destroyed" errors
    contextMenu({
        showInspectElement: true,
        showSearchWithGoogle: false,
        showLookUpSelection: false,
        append: (_defaultActions, _params, browserWindow) => [
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
        ],
    });
};


