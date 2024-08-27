import { runPromptProcess } from './kit';
import { getMainScriptPath } from '@johnlindquist/kit/core/utils';
import { Trigger } from '../shared/enums';

export async function runMainScript() {
  await runPromptProcess(getMainScriptPath(), [], {
    force: true,
    trigger: Trigger.Menu,
    sponsorCheck: true,
  });
}
