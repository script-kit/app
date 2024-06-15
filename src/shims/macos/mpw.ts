import { BrowserWindow } from "electron";
import { platform } from 'node:os';


export type MacPanelWindowModuleShim = {
  makeKeyWindow: (window: BrowserWindow) => any;
  makePanel: (window: BrowserWindow) => any;
  makeWindow: (window: BrowserWindow) => any;
  hideInstant: (window: BrowserWindow) => any;
  getWindowBackgroundColor: () => any;
  getLabelColor: () => any;
  getTextColor: () => any;
}

export const importMacPanelWindowOrShim = async (): Promise<MacPanelWindowModuleShim> => {
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
    }
  }

  // @ts-ignore Only importable on Mac
  return await import('@johnlindquist/mac-panel-window')
}
