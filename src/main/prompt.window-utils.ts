import type { BrowserWindow, Rectangle } from 'electron';
import { AppChannel } from '../shared/enums';

export function setPromptBounds(window: BrowserWindow, id: string, bounds: Rectangle, send: (channel: AppChannel, data: any) => void) {
    window.setBounds(bounds, false);
    const current = window.getBounds();
    send(AppChannel.SET_PROMPT_BOUNDS as any, { id, ...current });
}

export function centerThenFocus(window: BrowserWindow, focus: () => void) {
    window.setPosition(0, 0);
    window.center();
    focus();
}


