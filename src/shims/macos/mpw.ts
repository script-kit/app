import { platform } from 'node:os';

export const importMacPanelWindowOrShim =
  // @ts-ignore Only importable on Mac
  async (): Promise<typeof import('@johnlindquist/mac-panel-window')> => {
    if (platform() !== 'darwin') {
      const err = () => {
        throw new Error('This module is only available on macOS');
      };

      return {
        makeKeyWindow: err,
        makePanel: err,
        makeWindow: err,
        hideInstant: err,
        getWindowBackgroundColor: err,
        getLabelColor: err,
        getTextColor: err,
      };
    }

    // @ts-ignore Only importable on Mac
    return await import('@johnlindquist/mac-panel-window');
  };
