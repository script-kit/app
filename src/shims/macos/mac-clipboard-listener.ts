import { platform } from 'node:os';

type ChangeHandler = () => void;

export type MacClipboardListenerModuleShim = {
  onClipboardImageChange: (handler: ChangeHandler) => void;
  onClipboardTextChange: (handler: ChangeHandler) => void;
  start: () => void;
  stop: () => void;
}

export const importMacClipboardListenerOrShim = async (): Promise<MacClipboardListenerModuleShim> => {
  if (platform() !== 'darwin') {
    const err = () => {
      throw new Error('This module is only available on macOS');
    };

    return {
      onClipboardImageChange: err,
      onClipboardTextChange: err,
      start: err,
      stop: err
    }
  }

  // @ts-ignore Only importable on Mac
  return await import('@johnlindquist/mac-clipboard-listener')
}
