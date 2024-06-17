import { platform } from 'node:os';

export type FrontmostApp = {
  localizedName: string;
  bundleIdentifier: string;
  bundleURLPath: string;
  executableURLPath: string;
  isFinishedLaunching: boolean;
  processIdentifier: number;
  x: number;
  y: number;
  width: number;
  height: number;
};

export type MacFrontmostModuleShim = {
  getFrontmostApp(): FrontmostApp
}

export const importMacFrontmostOrShim = async (): Promise<MacFrontmostModuleShim> => {
  if (platform() !== 'darwin') {
    return {
      getFrontmostApp: () => {
        throw new Error('This module is only available on macOS')
      }
    }
  }

  // @ts-ignore Only importable on Mac
  return await import('@johnlindquist/mac-frontmost')
}
