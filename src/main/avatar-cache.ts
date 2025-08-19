/**
 * Avatar cache managed by the main process
 * Persists across browser windows
 */

import { app } from 'electron';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import axios from 'axios';
import { mainLog } from './logs';

const CACHE_DIR = path.join(app.getPath('userData'), 'avatar-cache');
const CACHE_DURATION = 7 * 24 * 60 * 60 * 1000; // 7 days

interface CacheEntry {
  dataUrl: string;
  timestamp: number;
  url: string;
}

// In-memory cache for quick access
const memoryCache = new Map<string, CacheEntry>();

async function ensureCacheDir() {
  try {
    await mkdir(CACHE_DIR, { recursive: true });
  } catch (error) {
    mainLog.error('Failed to create avatar cache directory:', error);
  }
}

function getCacheFilePath(url: string): string {
  // Create a safe filename from URL
  const sanitized = url.replace(/[^a-zA-Z0-9]/g, '_');
  return path.join(CACHE_DIR, `${sanitized}.json`);
}

export async function getCachedAvatar(avatarUrl: string): Promise<string | null> {
  if (!avatarUrl) return null;

  try {
    // Check memory cache first
    const memCached = memoryCache.get(avatarUrl);
    if (memCached && Date.now() - memCached.timestamp < CACHE_DURATION) {
      mainLog.info(`Avatar cache hit (memory): ${avatarUrl}`);
      return memCached.dataUrl;
    }

    // Check disk cache
    const cachePath = getCacheFilePath(avatarUrl);
    try {
      const cacheData = await readFile(cachePath, 'utf-8');
      const entry: CacheEntry = JSON.parse(cacheData);
      
      if (Date.now() - entry.timestamp < CACHE_DURATION) {
        mainLog.info(`Avatar cache hit (disk): ${avatarUrl}`);
        // Store in memory for next time
        memoryCache.set(avatarUrl, entry);
        return entry.dataUrl;
      }
    } catch {
      // Cache miss or invalid cache file
    }

    // Fetch and cache the avatar
    mainLog.info(`Fetching avatar: ${avatarUrl}`);
    const response = await axios.get(avatarUrl, {
      responseType: 'arraybuffer',
      timeout: 5000,
      headers: {
        'User-Agent': 'Script-Kit-App'
      }
    });

    // Convert to base64 data URL
    const base64 = Buffer.from(response.data).toString('base64');
    const contentType = response.headers['content-type'] || 'image/png';
    const dataUrl = `data:${contentType};base64,${base64}`;

    // Save to cache
    const entry: CacheEntry = {
      dataUrl,
      timestamp: Date.now(),
      url: avatarUrl
    };

    // Save to memory cache
    memoryCache.set(avatarUrl, entry);

    // Save to disk cache
    await ensureCacheDir();
    await writeFile(cachePath, JSON.stringify(entry), 'utf-8');
    
    mainLog.info(`Avatar cached: ${avatarUrl}`);
    return dataUrl;

  } catch (error) {
    mainLog.error('Failed to get cached avatar:', error);
    // Return original URL as fallback
    return avatarUrl;
  }
}

export async function clearAvatarCache(): Promise<void> {
  try {
    memoryCache.clear();
    // Could also clear disk cache here if needed
    mainLog.info('Avatar cache cleared');
  } catch (error) {
    mainLog.error('Failed to clear avatar cache:', error);
  }
}