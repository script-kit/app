import { Channel } from '@johnlindquist/kit/core/enum';
import { screen } from 'electron';
import type { KitPrompt } from './prompt';
import type { IPromptContext } from './prompt.types';
import { kitState } from './state';

export function setupResizeAndMoveListeners(prompt: KitPrompt) {
  const ctx = prompt as IPromptContext;

  const onResized = () => {
    prompt.logSilly('event: onResized');
    ctx.modifiedByUser = false;
    prompt.logInfo(`Resized: ${prompt.window.getSize()}`);
    if (ctx.resizing) ctx.resizing = false;
    ctx.saveCurrentPromptBounds();
  };

  if (kitState.isLinux) {
    prompt.window.on('resize', () => {
      (kitState as any).modifiedByUser = true;
    });
  } else {
    prompt.window.on('will-resize', (_event, rect) => {
      prompt.logSilly(`Will Resize ${rect.width} ${rect.height}`);
      ctx.sendToPrompt(Channel.SET_PROMPT_BOUNDS, {
        id: ctx.id,
        ...rect,
        human: true,
      });
      ctx.modifiedByUser = true;
    });
  }

  const willMoveHandler = () => {
    prompt.logSilly('event: will-move');
    (kitState as any).modifiedByUser = true;
  };

  const onMoved = () => {
    prompt.logSilly('event: onMove');
    ctx.modifiedByUser = false;
    ctx.saveCurrentPromptBounds();
  };

  prompt.window.on('will-move', willMoveHandler);
  prompt.window.on('resized', onResized);
  prompt.window.on('moved', onMoved);

  if (kitState.isWindows) {
    const handler = (_e, display, changedMetrics) => {
      if (changedMetrics.includes('scaleFactor')) {
        prompt.window.webContents.setZoomFactor(1 / display.scaleFactor);
      }
    };
    screen.on('display-metrics-changed', handler);
    prompt.window.webContents.setZoomFactor(1 / screen.getPrimaryDisplay().scaleFactor);
    prompt.window.on('close', () => {
      screen.removeListener('display-metrics-changed', handler);
    });
  }
}
