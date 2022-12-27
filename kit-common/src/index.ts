import { ProcessType } from '@johnlindquist/kit/core/enum';
import type { Choice, Script } from '@johnlindquist/kit/types';

export const noScript: Script = {
  id: '',
  filePath: '__app__/no-script',
  command: '',
  name: '',
  type: ProcessType.App,
  kenv: '',
};

export const noChoice: Choice = {
  id: '',
  name: '__app__/no-choice',
};

export * from './defaults';
export * from './color-utils';
export * from './enums';
