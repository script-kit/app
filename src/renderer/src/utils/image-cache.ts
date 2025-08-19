/**
 * Image caching utility for avatar images
 * Uses main process cache for persistence across windows
 */

import { AppChannel } from '../../../shared/enums';

const { ipcRenderer } = window.electron;

// Local memory cache for this window instance
const memoryCache = new Map<string, string>();

/**
 * Preloads and caches an image URL using main process cache
 */
export async function cacheImage(url: string): Promise<string> {
  if (!url) return '';
  // Fast-path: if already a data URL, return immediately
  if (url.startsWith('data:')) return url;

  try {
    // Check local memory cache first
    const cached = memoryCache.get(url);
    if (cached) {
      return cached;
    }

    // Request from main process cache (persists across windows)
    const cachedDataUrl = await ipcRenderer.invoke(AppChannel.GET_CACHED_AVATAR, url);
    
    if (cachedDataUrl) {
      // Store in local memory cache for this window
      memoryCache.set(url, cachedDataUrl);
      return cachedDataUrl;
    }
    
    // If main process returns original URL, use it
    return url;
  } catch (error) {
    console.error('Failed to cache image:', error);
    // Return original URL as fallback
    return url;
  }
}

/**
 * Clears the avatar cache
 */
export async function clearAvatarCache(): Promise<void> {
  try {
    // Clear local memory cache
    memoryCache.clear();
    
    // Clear main process cache
    await ipcRenderer.invoke(AppChannel.CLEAR_AVATAR_CACHE);
  } catch (error) {
    console.error('Failed to clear avatar cache:', error);
  }
}

/**
 * Hook to use cached avatar URL
 */
import { useEffect, useState } from 'react';

export function useCachedAvatar(avatarUrl: string | undefined): string | undefined {
  const [cachedUrl, setCachedUrl] = useState<string | undefined>(avatarUrl);

  useEffect(() => {
    if (!avatarUrl) {
      setCachedUrl(undefined);
      return undefined;
    }

    let cancelled = false;
    
    // Set the original URL immediately to prevent flicker
    setCachedUrl(avatarUrl);

    cacheImage(avatarUrl)
      .then((blobUrl) => {
        if (!cancelled && blobUrl && blobUrl !== avatarUrl) {
          console.log('Avatar cached successfully:', blobUrl);
          setCachedUrl(blobUrl);
        }
      })
      .catch((error) => {
        console.error('Failed to cache avatar, using original URL:', error);
        if (!cancelled) {
          // Keep using the original URL on error
          setCachedUrl(avatarUrl);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [avatarUrl]);

  // Always return something to prevent layout shift
  return cachedUrl || avatarUrl;
}