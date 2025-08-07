import { debounce } from 'lodash-es';
import type { KitPrompt } from './prompt';
import { Channel } from '@johnlindquist/kit/core/enum';
import { screen } from 'electron';
import { kitState } from './state';

export function setupResizeAndMoveListeners(prompt: KitPrompt) {
  const onResized = () => {
    prompt.logSilly('event: onResized');
    prompt.modifiedByUser = false as any;
    prompt.logInfo(`Resized: ${prompt.window.getSize()}`);
    if ((prompt as any).resizing) (prompt as any).resizing = false;
    prompt.saveCurrentPromptBounds();
  };

  if (kitState.isLinux) {
    prompt.window.on('resize', () => {
      (kitState as any).modifiedByUser = true;
    });
  } else {
    prompt.window.on('will-resize', (_event, rect) => {
      prompt.logSilly(`Will Resize ${rect.width} ${rect.height}`);
      prompt.sendToPrompt(Channel.SET_PROMPT_BOUNDS, {
        id: (prompt as any).id,
        ...rect,
        human: true,
      });
      (prompt as any).modifiedByUser = true;
    });
  }

  const willMoveHandler = debounce(
    () => {
      prompt.logSilly('event: will-move');
      (kitState as any).modifiedByUser = true;
    },
    250,
    { leading: true },
  );

  const onMoved = debounce(() => {
    prompt.logSilly('event: onMove');
    (prompt as any).modifiedByUser = false;
    prompt.saveCurrentPromptBounds();
  }, 250);

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


