import { PROMPT, UI } from '@johnlindquist/kit/core/enum';
import type { Rectangle } from 'electron';
import type { ResizeData } from '../shared/types';
import { getMainScriptPath } from '@johnlindquist/kit/core/utils';
import { getCurrentScreenPromptCache } from './prompt.screen-utils';

const getDefaultWidth = () => PROMPT.WIDTH.BASE;

export function calculateTargetDimensions(
    resizeData: ResizeData,
    currentBounds: Rectangle,
): Pick<Rectangle, 'width' | 'height'> {
    const {
        topHeight,
        mainHeight,
        footerHeight,
        ui,
        isSplash,
        hasPreview,
        forceHeight,
        forceWidth,
        // Note: hasInput previously gated shrinking below base for main script,
        // but that blocked legitimate initial shrinks when choices are small.
        // Prefer placeholderOnly/totalChoices instead.
        hasInput,
        isMainScript,
        placeholderOnly,
        totalChoices,
    } = resizeData as ResizeData & { placeholderOnly?: boolean; totalChoices?: number };

    const getCachedDimensions = (): Partial<Pick<Rectangle, 'width' | 'height'>> => {
        if (!isMainScript) return {};
        const cachedBounds = getCurrentScreenPromptCache(getMainScriptPath());
        // Use cached height only when we're effectively in a placeholder state (no actionable content yet).
        // When choices are present, prefer the measured target height so the window can shrink immediately.
        const choicesCount = typeof totalChoices === 'number' ? totalChoices : 0;
        const useCachedHeight = Boolean(placeholderOnly) || choicesCount === 0;
        return {
            width: cachedBounds?.width || getDefaultWidth(),
            height: useCachedHeight ? (cachedBounds?.height || PROMPT.HEIGHT.BASE) : undefined,
        };
    };

    const { width: cachedWidth, height: cachedHeight } = getCachedDimensions();

    const maxHeight = Math.max(PROMPT.HEIGHT.BASE, currentBounds.height);
    const targetHeight = topHeight + mainHeight + footerHeight;

    let width = cachedWidth || forceWidth || currentBounds.width;
    let height = cachedHeight || forceHeight || Math.round(targetHeight > maxHeight ? maxHeight : targetHeight);

    if (isSplash) {
        return {
            width: PROMPT.WIDTH.BASE,
            height: PROMPT.HEIGHT.BASE,
        };
    }

    height = Math.round(height);
    width = Math.round(width);

    const heightLessThanBase = height < PROMPT.HEIGHT.BASE;

    // Keep terminal/editor at least base height
    if ([UI.term, UI.editor].includes(ui) && heightLessThanBase) {
        height = PROMPT.HEIGHT.BASE;
    }

    // Main menu behavior:
    // Allow shrinking below base when there are actionable choices (or any choices),
    // and no placeholder-only state. This restores prior behavior where main could
    // shrink to fit small lists on initial choice swaps.
    if (isMainScript && heightLessThanBase) {
        const choicesCount = typeof totalChoices === 'number' ? totalChoices : 0;
        const isPlaceholder = Boolean(placeholderOnly);
        const allowShrink = choicesCount > 0 && !isPlaceholder;
        if (!allowShrink) {
            height = PROMPT.HEIGHT.BASE;
        }
    }

    if (hasPreview) {
        if (!isMainScript) {
            width = Math.max(getDefaultWidth(), width);
        }
        height = currentBounds.height < PROMPT.HEIGHT.BASE ? PROMPT.HEIGHT.BASE : currentBounds.height;
    }

    return { width, height };
}

export function calculateTargetPosition(
    currentBounds: Rectangle,
    targetDimensions: Pick<Rectangle, 'width' | 'height'>,
    cachedBounds?: Partial<Rectangle>,
): Pick<Rectangle, 'x' | 'y'> {
    const newX = cachedBounds?.x ?? Math.round(currentBounds.x + (currentBounds.width - targetDimensions.width) / 2);
    const newY = cachedBounds?.y ?? currentBounds.y;
    return { x: newX, y: newY };
}
