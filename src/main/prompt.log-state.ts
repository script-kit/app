import { prompts } from './prompts';
import { promptLog as log } from './logs';

interface PromptState {
    [key: string]: boolean;
}

let prevPromptState: PromptState = {} as any;

export function logPromptStateFlow() {
    for (const prompt of prompts) {
        const promptState: PromptState = {
            isMinimized: prompt.window.isMinimized(),
            isVisible: prompt.window.isVisible(),
            isFocused: prompt.window.isFocused(),
            isDestroyed: prompt.window.isDestroyed(),
            isFullScreen: prompt.window.isFullScreen(),
            isFullScreenable: prompt.window.isFullScreenable(),
            isMaximizable: prompt.window.isMaximizable(),
            isResizable: prompt.window.isResizable(),
            isModal: prompt.window.isModal(),
            isAlwaysOnTop: prompt.window.isAlwaysOnTop(),
            isClosable: prompt.window.isClosable(),
            isMovable: prompt.window.isMovable(),
            isSimpleFullScreen: prompt.window.isSimpleFullScreen(),
            isKiosk: prompt.window.isKiosk(),
            isNormal: (prompt.window as any).isNormal?.(),
            isVisibleOnAllWorkspaces: (prompt.window as any).isVisibleOnAllWorkspaces?.(),
        };

        const diff = Object.keys(promptState).reduce((acc: any, key) => {
            if ((promptState as any)[key] !== (prevPromptState as any)[key]) {
                acc[key] = (promptState as any)[key];
            }
            return acc;
        }, {} as any);

        if (Object.keys(diff).length > 0) {
            log.info(`\n  👙 Prompt State:`, JSON.stringify(diff, null, 2));
            prevPromptState = promptState;
        }
    }
}


