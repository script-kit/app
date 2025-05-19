import { createPathResolver } from '@johnlindquist/kit/core/utils';
import { app } from 'electron';
import { ensureDirSync } from './cjs-exports';

export const osTmpPath = (...paths: string[]) => {
  const tmpDir = createPathResolver(app.getPath('userData'));
  ensureDirSync(tmpDir());

  return tmpDir(...paths);
};
