import { getMainScriptPath } from '@johnlindquist/kit/core/utils';
import { Trigger } from '../shared/enums';
import { runPromptProcess } from './kit';

export async function runMainScript() {
  await runPromptProcess(getMainScriptPath(), [], {
    force: true,
    trigger: Trigger.Menu,
    sponsorCheck: true,
  });
}
