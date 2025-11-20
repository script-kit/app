import type { PromptBounds } from '@johnlindquist/kit/types/core';
import type { Rectangle } from 'electron';
import { screen } from 'electron';

import { promptLog as log } from './logs';
import { prompts } from './prompts';
import { OFFSCREEN_X, OFFSCREEN_Y } from './prompt.options';
import { getCurrentScreen, getCurrentScreenFromBounds, isBoundsWithinDisplayById, isBoundsWithinDisplays } from './screen';
import {
    kitState,
    preloadChoicesMap,
    preloadPreviewMap,
    preloadPromptDataMap,
    promptState,
} from './state';

export const writePromptState = (
    prompt: { isDestroyed: () => boolean },
    screenId: string,
    scriptPath: string,
    bounds: PromptBounds,
) => {
    if (!prompt || prompt.isDestroyed()) return;
    // Only save when input is clear - enforced by caller
    log.verbose('writePromptState', { screenId, scriptPath, bounds });

    if (!promptState?.screens) promptState.screens = {} as any;
    if (!promptState?.screens[screenId]) promptState.screens[screenId] = {} as any;

    if (!bounds.height) return;
    if (!bounds.width) return;
    if (!bounds.x && bounds.x !== 0) return;
    if (!bounds.y && bounds.y !== 0) return;

    promptState.screens[screenId][scriptPath] = bounds;
};

export const clearPromptCache = async () => {
    // Leave stale implementation as no-op to preserve external API
};

export const destroyPromptWindow = () => {
    // Legacy no-op; left for API compatibility
};

export const clearPromptTimers = async () => {
    // Timers are managed within KitPrompt; this is a safe no-op here
};

export const clearPromptCacheFor = async (scriptPath: string) => {
    try {
        const displays = screen.getAllDisplays();
        for await (const display of displays) {
            if (promptState?.screens?.[display.id]?.[scriptPath]) {
                delete promptState.screens[display.id][scriptPath];
                log.verbose(`🗑 Clear prompt cache for ${scriptPath} on ${display.id}`);
            }
        }
    } catch (e) {
        log.error(e);
    }

    if (preloadChoicesMap.has(scriptPath)) preloadChoicesMap.delete(scriptPath);
    if (preloadPromptDataMap.has(scriptPath)) preloadPromptDataMap.delete(scriptPath);
    if (preloadPreviewMap.has(scriptPath)) preloadPreviewMap.delete(scriptPath);
};

