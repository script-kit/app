/**
 * Miscellaneous utility atoms.
 * Simple atoms that don't fit into other categories.
 */

import { atom } from 'jotai';
import { Channel, UI } from '@johnlindquist/kit/core/enum';
import { AppChannel } from '../../../../shared/enums';

// Import dependencies from shared-dependencies to avoid circular imports
import { uiAtom } from '../shared-dependencies';
import { pushIpcMessageAtom } from '../selectors/ipcOutbound';

// Note: changeAtom and runMainScriptAtom are defined in jotai.ts
// They need to return functions for compatibility with useAtomValue usage

// Note: These atoms are commented out because they're defined in jotai.ts
// They need to remain there as they return functions for event handlers
// and require special handling with channelAtom

// export const onPasteAtom = ...
// export const onDropAtom = ...

