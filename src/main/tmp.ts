import { app } from 'electron';
import { createPathResolver } from '@johnlindquist/kit/core/utils';

export const osTmpPath = createPathResolver(app.getPath('temp'));
