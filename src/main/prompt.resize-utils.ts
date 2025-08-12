import { PROMPT, UI } from '@johnlindquist/kit/core/enum';
import { screen } from 'electron';
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
        hasInput,
        isMainScript,
    } = resizeData;

    const getCachedDimensions = (): Partial<Pick<Rectangle, 'width' | 'height'>> => {
        if (!isMainScript) return {};
        const cachedBounds = getCurrentScreenPromptCache(getMainScriptPath());
        return {
            width: cachedBounds?.width || getDefaultWidth(),
            height: hasInput ? undefined : cachedBounds?.height || PROMPT.HEIGHT.BASE,
        };
    };

    const { width: cachedWidth, height: cachedHeight } = getCachedDimensions();

    const display = screen.getDisplayMatching(currentBounds);
    const workH = display?.workArea?.height || currentBounds.height;
    const maxHeight = Math.max(PROMPT.HEIGHT.BASE, workH);
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

    if ((isMainScript && !hasInput && heightLessThanBase) || ([UI.term, UI.editor].includes(ui) && heightLessThanBase)) {
        height = PROMPT.HEIGHT.BASE;
    }

    if (hasPreview) {
        if (!isMainScript) width = Math.max(getDefaultWidth(), width);
        // Let preview grow up to work area height while respecting computed targetHeight
        height = Math.max(PROMPT.HEIGHT.BASE, Math.min(targetHeight, workH));
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


