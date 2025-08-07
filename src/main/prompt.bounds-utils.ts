import type { Rectangle, BrowserWindow } from 'electron';
import { PROMPT } from '@johnlindquist/kit/core/enum';
import { promptLog as log } from './logs';
import type { PromptData } from '@johnlindquist/kit/types/core';

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

export function applyPromptDataBounds(window: BrowserWindow, promptData: PromptData) {
  const { x, y, width, height, ui } = promptData as any;

  // Handle position
  if (x !== undefined || y !== undefined) {
    const [currentX, currentY] = window?.getPosition() || [];
    if ((x !== undefined && x !== currentX) || (y !== undefined && y !== currentY)) {
      window?.setPosition(
        x !== undefined ? Math.round(Number(x)) : currentX,
        y !== undefined ? Math.round(Number(y)) : currentY,
      );
    }
  }

  // Only handle size if not UI.arg and dimensions are provided
  if (ui !== 'arg' && (width !== undefined || height !== undefined)) {
    const [currentWidth, currentHeight] = window?.getSize() || [];
    if ((width !== undefined && width !== currentWidth) || (height !== undefined && height !== currentHeight)) {
      window?.setSize(
        width !== undefined ? Math.round(Number(width)) : currentWidth,
        height !== undefined ? Math.round(Number(height)) : currentHeight,
      );
    }
  }
}


