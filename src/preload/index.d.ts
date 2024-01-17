import { ElectronAPI } from '@electron-toolkit/preload';
import { kitPath, getMainScriptPath } from '@johnlindquist/kit/core/utils';

interface API {
  kitPath: typeof kitPath;
  getMainScriptPath: typeof getMainScriptPath;
}

declare global {
  interface Window {
    electron: ElectronAPI;
    api: API;
  }
}
