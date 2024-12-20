import type { BrowserWindow } from 'electron';
import { kitState } from '../state';
import shims from '../shims';

export const hideInstant = debounce(
  (window: BrowserWindow) => {
    if (!window || window.isDestroyed() || !window.isVisible()) {
      return;
    }

    if (kitState.isWindows) {
      // Windows-specific hide logic
      shims['@johnlindquist/node-window-manager'].windowManager.hideInstantly(window.getNativeWindowHandle());
      if (window.isFocused()) {
        window.emit('blur');
        window.emit('hide');
      }
    } else if (kitState.isMac) {
      // macOS-specific hide logic
      shims['@johnlindquist/mac-panel-window'].hideInstant(window);
    } else if (kitState.isLinux) {
      // Linux logic
      window.hide();
    }
  },
  100,
  { leading: true, trailing: false },
);
