import type { Rectangle, BrowserWindow } from 'electron';
import { PROMPT } from '@johnlindquist/kit/core/enum';
import { promptLog as log } from './logs';

export function adjustBoundsToAvoidOverlap(
    peers: Array<{ id: string; bounds: Rectangle }>,
    selfId: string,
    target: Rectangle,
): Rectangle {
    const finalBounds = { ...target };

    let hasMatch = true;
    while (hasMatch) {
        hasMatch = false;
        for (const peer of peers) {
            if (!peer.id || peer.id === selfId) continue;

            const bounds = peer.bounds;
            if (bounds.x === finalBounds.x) {
                finalBounds.x += 40;
                hasMatch = true;
            }
            if (bounds.y === finalBounds.y) {
                finalBounds.y += 40;
                hasMatch = true;
            }
            if (hasMatch) break;
        }
    }

    return finalBounds;
}

export function getTitleBarHeight(window: BrowserWindow): number {
    const normalBounds = window.getNormalBounds();
    const contentBounds = window.getContentBounds();
    const windowBounds = window.getBounds();
    const size = window.getSize();
    const contentSize = window.getContentSize();
    const minimumSize = window.getMinimumSize();

    const titleBarHeight = windowBounds.height - contentBounds.height;
    log.info('titleBarHeight', {
        normalBounds,
        contentBounds,
        windowBounds,
        size,
        contentSize,
        minimumSize,
    });
    return titleBarHeight;
}

export function ensureMinWindowHeight(height: number, titleBarHeight: number): number {
    if (height < PROMPT.INPUT.HEIGHT.XS + titleBarHeight) {
        return PROMPT.INPUT.HEIGHT.XS + titleBarHeight;
    }
    return height;
}


