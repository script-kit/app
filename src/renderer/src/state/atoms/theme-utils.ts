/**
 * Theme and color utility atoms.
 * Handles color picking and theme-related functionality.
 */

import { Channel } from '@johnlindquist/kit/core/enum';
import * as colorUtils from '@johnlindquist/kit/core/utils';
import { atom } from 'jotai';
import { pushIpcMessageAtom } from '../selectors/ipcOutbound';
// Import dependencies from shared-dependencies to avoid circular imports
import { pidAtom } from '../shared-dependencies';

// Note: colorAtom is defined in jotai.ts
// It needs to return a function for compatibility with useAtomValue usage
