/**
 * Effect to preload and cache user avatar images
 */

import { withAtomEffect } from 'jotai-effect';
import { userAtom } from '../jotai';
import { cacheImage } from '../utils/image-cache';

// Warm the cache whenever userAtom updates
export const avatarCacheEffect = withAtomEffect(userAtom, (get) => {
  const user = get(userAtom);
  const url = (user as any)?.avatar_url as string | undefined;
  if (url) {
    // fire and forget; cacheImage is idempotent and cheap for data: URLs
    void cacheImage(url);
  }
});
