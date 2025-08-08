import type { PromptBounds } from '@johnlindquist/kit/types/core';
import { promptLog as log } from './logs';
import { promptState } from './state';

interface WritePromptStatePrompt {
    window?: unknown;
    isDestroyed: () => boolean;
    kitSearch: {
        input: string;
        inputRegex?: RegExp;
    };
}

export const writePromptState = (
    prompt: WritePromptStatePrompt,
    screenId: string,
    scriptPath: string,
    bounds: PromptBounds,
): void => {
    // Preserve original guard logic exactly (no behavior change)
    if (!(prompt.window && prompt?.isDestroyed())) {
        return;
    }
    if (prompt.kitSearch.input !== '' || prompt.kitSearch.inputRegex) {
        return;
    }
    log.verbose('writePromptState', { screenId, scriptPath, bounds });

    if (!promptState?.screens) {
        (promptState as any).screens = {} as any;
    }
    if (!promptState?.screens[screenId]) {
        (promptState as any).screens[screenId] = {} as any;
    }

    if (!bounds.height) {
        return;
    }
    if (!bounds.width) {
        return;
    }
    if (!bounds.x) {
        return;
    }
    if (!bounds.y) {
        return;
    }
    (promptState as any).screens[screenId][scriptPath] = bounds;
};


