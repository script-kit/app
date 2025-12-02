/**
 * Widget Persistence - Save and restore widget state across app restarts
 *
 * This module provides snapshot/restore functionality for widgets,
 * allowing them to save their position, size, and state to disk
 * and restore them on next launch.
 */

import { app, BrowserWindow } from 'electron';
import path from 'node:path';
import { readFile, writeFile, readdir, mkdir, unlink } from 'node:fs/promises';
import { createLogger } from './log-utils';

const log = createLogger('widget-persistence.ts');

/**
 * Widget snapshot data structure
 */
export interface WidgetSnapshot {
  /** Unique identifier for this snapshot */
  id: string;
  /** Script path that created the widget */
  scriptPath: string;
  /** Widget bounds (position and size) */
  bounds: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  /** Widget state (petite-vue reactive state) */
  state: any;
  /** Widget options used when creating */
  options: any;
  /** HTML content (optional - may be large) */
  html?: string;
  /** Timestamp when snapshot was created */
  savedAt: number;
  /** Version for future compatibility */
  version: number;
}

/**
 * Get the directory where widget snapshots are stored
 */
function getSnapshotsDir(): string {
  return path.join(app.getPath('userData'), 'widget-snapshots');
}

/**
 * Ensure the snapshots directory exists
 */
async function ensureSnapshotsDir(): Promise<void> {
  const dir = getSnapshotsDir();
  try {
    await mkdir(dir, { recursive: true });
  } catch (error) {
    // Directory already exists
  }
}

/**
 * Get the file path for a snapshot
 */
function getSnapshotPath(id: string): string {
  // Sanitize the id to be a valid filename
  const safeId = id.replace(/[^a-zA-Z0-9_-]/g, '_');
  return path.join(getSnapshotsDir(), `${safeId}.json`);
}

/**
 * Save a widget snapshot to disk
 */
export async function saveSnapshot(snapshot: WidgetSnapshot): Promise<string> {
  await ensureSnapshotsDir();

  const filePath = getSnapshotPath(snapshot.id);

  try {
    await writeFile(filePath, JSON.stringify(snapshot, null, 2), 'utf-8');
    log.info('[WidgetPersistence] Saved snapshot', {
      id: snapshot.id,
      path: filePath,
      bounds: snapshot.bounds,
    });
    return snapshot.id;
  } catch (error) {
    log.error('[WidgetPersistence] Failed to save snapshot', {
      id: snapshot.id,
      error: error instanceof Error ? error.message : error,
    });
    throw error;
  }
}

/**
 * Load a widget snapshot from disk
 */
export async function loadSnapshot(id: string): Promise<WidgetSnapshot | null> {
  const filePath = getSnapshotPath(id);

  try {
    const content = await readFile(filePath, 'utf-8');
    const snapshot = JSON.parse(content) as WidgetSnapshot;

    log.info('[WidgetPersistence] Loaded snapshot', {
      id: snapshot.id,
      savedAt: new Date(snapshot.savedAt).toISOString(),
      bounds: snapshot.bounds,
    });

    return snapshot;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      log.info('[WidgetPersistence] Snapshot not found', { id });
      return null;
    }

    log.error('[WidgetPersistence] Failed to load snapshot', {
      id,
      error: error instanceof Error ? error.message : error,
    });
    return null;
  }
}

/**
 * Delete a widget snapshot
 */
export async function deleteSnapshot(id: string): Promise<boolean> {
  const filePath = getSnapshotPath(id);

  try {
    await unlink(filePath);
    log.info('[WidgetPersistence] Deleted snapshot', { id });
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return false;
    }
    log.error('[WidgetPersistence] Failed to delete snapshot', {
      id,
      error: error instanceof Error ? error.message : error,
    });
    return false;
  }
}

/**
 * List all saved snapshots
 */
export async function listSnapshots(): Promise<string[]> {
  await ensureSnapshotsDir();
  const dir = getSnapshotsDir();

  try {
    const files = await readdir(dir);
    return files
      .filter((f) => f.endsWith('.json'))
      .map((f) => f.replace('.json', ''));
  } catch (error) {
    log.error('[WidgetPersistence] Failed to list snapshots', {
      error: error instanceof Error ? error.message : error,
    });
    return [];
  }
}

/**
 * Create a snapshot from a BrowserWindow
 */
export function createSnapshotFromWindow(
  window: BrowserWindow,
  id: string,
  options: {
    scriptPath: string;
    state?: any;
    widgetOptions?: any;
    html?: string;
  },
): WidgetSnapshot {
  const bounds = window.getBounds();

  return {
    id,
    scriptPath: options.scriptPath,
    bounds: {
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height,
    },
    state: options.state || {},
    options: options.widgetOptions || {},
    html: options.html,
    savedAt: Date.now(),
    version: 1,
  };
}

/**
 * Get snapshot metadata without loading full content
 */
export async function getSnapshotInfo(
  id: string,
): Promise<{ id: string; savedAt: number; bounds: WidgetSnapshot['bounds'] } | null> {
  const snapshot = await loadSnapshot(id);
  if (!snapshot) return null;

  return {
    id: snapshot.id,
    savedAt: snapshot.savedAt,
    bounds: snapshot.bounds,
  };
}

/**
 * Clean up old snapshots (older than specified days)
 */
export async function cleanupOldSnapshots(maxAgeDays = 30): Promise<number> {
  const ids = await listSnapshots();
  const maxAge = maxAgeDays * 24 * 60 * 60 * 1000;
  const now = Date.now();
  let deleted = 0;

  for (const id of ids) {
    const info = await getSnapshotInfo(id);
    if (info && now - info.savedAt > maxAge) {
      await deleteSnapshot(id);
      deleted++;
    }
  }

  if (deleted > 0) {
    log.info('[WidgetPersistence] Cleaned up old snapshots', {
      deleted,
      maxAgeDays,
    });
  }

  return deleted;
}
