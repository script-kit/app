/**
 * Frecency Service - Tracks frequency + recency of choice selections
 *
 * Frecency scoring combines:
 * - Frequency: How often an item is selected
 * - Recency: How recently an item was selected (with decay)
 *
 * Formula: score = (accessCount * weight) / (hoursSinceLastAccess + 1)
 *
 * This allows frequently used items to rank higher in search results,
 * similar to Firefox's Awesome Bar and VS Code's command palette.
 */

import { dirname, join } from 'node:path';
import { kitPath } from '@johnlindquist/kit/core/utils';
import { ensureDir, pathExists, readJson, writeJson } from './cjs-exports';
import { searchLog as log } from './logs';

interface FrecencyEntry {
  /** Number of times this choice was selected */
  accessCount: number;
  /** Timestamp of last selection */
  lastAccessedAt: number;
  /** Computed frecency score (cached) */
  cachedScore?: number;
  /** Timestamp when cachedScore was computed */
  cachedAt?: number;
}

interface FrecencyData {
  version: number;
  entries: Record<string, FrecencyEntry>;
}

// Config
const FRECENCY_FILE = 'db/frecency.json';
const FRECENCY_VERSION = 1;
const CACHE_TTL_MS = 60 * 1000; // 1 minute cache validity
const MAX_ENTRIES = 5000; // Limit to prevent unbounded growth
const DECAY_HALF_LIFE_HOURS = 24 * 7; // Score halves every week

// In-memory cache
let frecencyData: FrecencyData | null = null;
let isDirty = false;
let saveTimeout: NodeJS.Timeout | null = null;

/**
 * Get the frecency file path
 */
function getFrecencyPath(): string {
  return kitPath(FRECENCY_FILE);
}

/**
 * Load frecency data from disk
 */
async function loadFrecencyData(): Promise<FrecencyData> {
  if (frecencyData) {
    return frecencyData;
  }

  const filePath = getFrecencyPath();

  try {
    if (await pathExists(filePath)) {
      const data = await readJson(filePath);
      if (data.version === FRECENCY_VERSION) {
        frecencyData = data;
        return frecencyData;
      }
    }
  } catch (error) {
    log.warn(`Failed to load frecency data: ${error}`);
  }

  // Return empty data
  frecencyData = {
    version: FRECENCY_VERSION,
    entries: {},
  };
  return frecencyData;
}

/**
 * Save frecency data to disk (debounced)
 */
function scheduleSave(): void {
  if (saveTimeout) {
    return; // Already scheduled
  }

  saveTimeout = setTimeout(async () => {
    saveTimeout = null;

    if (!isDirty || !frecencyData) {
      return;
    }

    const filePath = getFrecencyPath();

    try {
      await ensureDir(dirname(filePath));
      await writeJson(filePath, frecencyData, { spaces: 2 });
      isDirty = false;
      log.info(`Saved frecency data with ${Object.keys(frecencyData.entries).length} entries`);
    } catch (error) {
      log.error(`Failed to save frecency data: ${error}`);
    }
  }, 5000); // Save after 5 seconds of inactivity
}

/**
 * Calculate frecency score for an entry
 */
function calculateFrecencyScore(entry: FrecencyEntry): number {
  const now = Date.now();
  const hoursSinceLastAccess = (now - entry.lastAccessedAt) / (1000 * 60 * 60);

  // Apply exponential decay based on half-life
  const decayFactor = 0.5 ** (hoursSinceLastAccess / DECAY_HALF_LIFE_HOURS);

  // Combine frequency and recency with decay
  // Using log to prevent extremely high scores from dominating
  const frequencyBonus = Math.log2(entry.accessCount + 1);

  return frequencyBonus * decayFactor * 100;
}

/**
 * Get frecency score for a choice ID
 * Returns a multiplier (1.0 = no boost, higher = more boost)
 */
export async function getFrecencyScore(choiceId: string): Promise<number> {
  if (!choiceId) return 1.0;

  const data = await loadFrecencyData();
  const entry = data.entries[choiceId];

  if (!entry) {
    return 1.0; // No history
  }

  // Check if cached score is still valid
  const now = Date.now();
  if (entry.cachedScore !== undefined && entry.cachedAt && now - entry.cachedAt < CACHE_TTL_MS) {
    return entry.cachedScore;
  }

  // Calculate and cache score
  const score = calculateFrecencyScore(entry);
  entry.cachedScore = score;
  entry.cachedAt = now;

  // Convert to multiplier (1.0 = baseline, max boost of ~3x for very frequent items)
  // Score of 100 = 1x, score of 300 = 2x, score of 500 = 3x
  return 1.0 + score / 200;
}

/**
 * Get frecency scores for multiple choice IDs (batch operation)
 */
export async function getFrecencyScores(choiceIds: string[]): Promise<Map<string, number>> {
  const data = await loadFrecencyData();
  const scores = new Map<string, number>();
  const now = Date.now();

  for (const id of choiceIds) {
    if (!id) {
      scores.set(id, 1.0);
      continue;
    }

    const entry = data.entries[id];
    if (!entry) {
      scores.set(id, 1.0);
      continue;
    }

    // Check cache
    if (entry.cachedScore !== undefined && entry.cachedAt && now - entry.cachedAt < CACHE_TTL_MS) {
      scores.set(id, entry.cachedScore);
      continue;
    }

    // Calculate and cache
    const score = calculateFrecencyScore(entry);
    entry.cachedScore = score;
    entry.cachedAt = now;
    scores.set(id, 1.0 + score / 200);
  }

  return scores;
}

/**
 * Record a choice selection (increment frequency, update recency)
 */
export async function recordSelection(choiceId: string): Promise<void> {
  if (!choiceId) return;

  const data = await loadFrecencyData();
  const now = Date.now();

  if (data.entries[choiceId]) {
    // Update existing entry
    data.entries[choiceId].accessCount++;
    data.entries[choiceId].lastAccessedAt = now;
    data.entries[choiceId].cachedScore = undefined; // Invalidate cache
    data.entries[choiceId].cachedAt = undefined;
  } else {
    // Create new entry
    data.entries[choiceId] = {
      accessCount: 1,
      lastAccessedAt: now,
    };
  }

  isDirty = true;

  // Prune old entries if we have too many
  const entryCount = Object.keys(data.entries).length;
  if (entryCount > MAX_ENTRIES) {
    pruneOldEntries(data);
  }

  scheduleSave();
  log.silly(`Recorded selection for ${choiceId}`);
}

/**
 * Remove old/unused entries to prevent unbounded growth
 */
function pruneOldEntries(data: FrecencyData): void {
  const entries = Object.entries(data.entries);

  // Sort by frecency score (lowest first)
  entries.sort(([, a], [, b]) => {
    const scoreA = calculateFrecencyScore(a);
    const scoreB = calculateFrecencyScore(b);
    return scoreA - scoreB;
  });

  // Remove the lowest scoring 20%
  const toRemove = Math.floor(entries.length * 0.2);
  for (let i = 0; i < toRemove; i++) {
    const [id] = entries[i];
    delete data.entries[id];
  }

  log.info(`Pruned ${toRemove} frecency entries`);
}

/**
 * Get top N most frequently accessed choices
 * Useful for "Recent" section before user starts typing
 */
export async function getTopFrecent(limit = 10): Promise<string[]> {
  const data = await loadFrecencyData();
  const entries = Object.entries(data.entries);

  // Sort by frecency score (highest first)
  entries.sort(([, a], [, b]) => {
    const scoreA = calculateFrecencyScore(a);
    const scoreB = calculateFrecencyScore(b);
    return scoreB - scoreA;
  });

  return entries.slice(0, limit).map(([id]) => id);
}

/**
 * Clear all frecency data
 */
export async function clearFrecencyData(): Promise<void> {
  frecencyData = {
    version: FRECENCY_VERSION,
    entries: {},
  };
  isDirty = true;
  scheduleSave();
  log.info('Cleared frecency data');
}

/**
 * Force save frecency data immediately
 */
export async function saveFrecencyData(): Promise<void> {
  if (saveTimeout) {
    clearTimeout(saveTimeout);
    saveTimeout = null;
  }

  if (!isDirty || !frecencyData) {
    return;
  }

  const filePath = getFrecencyPath();

  try {
    await ensureDir(dirname(filePath));
    await writeJson(filePath, frecencyData, { spaces: 2 });
    isDirty = false;
    log.info('Force saved frecency data');
  } catch (error) {
    log.error(`Failed to force save frecency data: ${error}`);
  }
}
