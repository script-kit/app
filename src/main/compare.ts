import { isEqual } from 'lodash';
import { createLogger } from '../shared/log-utils';
import { MainLogger } from 'electron-log';

const log = createLogger('compare');

/**
 * Computes the differences between two objects, excluding the specified keys.
 * @param oldObj The original object.
 * @param newObj The updated object.
 * @param excludeKeys Keys to exclude from the comparison.
 * @returns An object containing the differences.
 */
export const getDifferences = (
  oldObj: Record<string, any>,
  newObj: Record<string, any>,
  excludeKeys: string[] = ['id'],
): Record<string, { before: any; after: any }> => {
  const diff: Record<string, { before: any; after: any }> = {};

  Object.keys(newObj).forEach((key) => {
    if (excludeKeys.includes(key)) return; // Skip excluded keys
    if (!isEqual(oldObj[key], newObj[key])) {
      diff[key] = { before: oldObj[key], after: newObj[key] };
    }
  });

  return diff;
};

/**
 * Compares two collections of items and identifies added, modified, and deleted items.
 * @param previousCollection The original collection as a Map with filePath as the key.
 * @param newCollection The updated collection as a Map with filePath as the key.
 * @param excludeKeys Keys to exclude from the comparison within each object.
 * @returns An object containing arrays of added, modified, and deleted items.
 */
export const compareCollections = (
  previousCollection: Map<string, Record<string, any>>,
  newCollection: Map<string, Record<string, any>>,
  excludeKeys: string[] = ['id'],
): {
  added: Array<{ filePath: string; item: Record<string, any> }>;
  modified: Array<{ filePath: string; differences: Record<string, { before: any; after: any }> }>;
  deleted: Array<{ filePath: string; item: Record<string, any> }>;
} => {
  const added: Array<{ filePath: string; item: Record<string, any> }> = [];
  const modified: Array<{ filePath: string; differences: Record<string, { before: any; after: any }> }> = [];
  const deleted: Array<{ filePath: string; item: Record<string, any> }> = [];

  // Identify added and modified items
  newCollection.forEach((newItem, filePath) => {
    const oldItem = previousCollection.get(filePath);
    if (!oldItem) {
      // Item is added
      added.push({ filePath, item: newItem });
    } else {
      // Compare items excluding specified keys
      const differences = getDifferences(oldItem, newItem, excludeKeys);
      if (Object.keys(differences).length > 0) {
        modified.push({ filePath, differences });
      }
    }
  });

  // Identify deleted items
  previousCollection.forEach((oldItem, filePath) => {
    if (!newCollection.has(filePath)) {
      deleted.push({ filePath, item: oldItem });
    }
  });

  return { added, modified, deleted };
};

/**
 * Logs the differences of a collection to the console.
 * @param collectionName The name of the collection (e.g., 'scriptlets', 'scripts').
 * @param differences The differences object containing added, modified, and deleted items.
 */
export const logDifferences = (
  log: MainLogger,
  collectionName: string,
  differences: {
    added: Array<{ filePath: string; item: Record<string, any> }>;
    modified: Array<{ filePath: string; differences: Record<string, { before: any; after: any }> }>;
    deleted: Array<{ filePath: string; item: Record<string, any> }>;
  },
): void => {
  const { added, modified, deleted } = differences;

  // Log added items
  if (added.length > 0) {
    log.info(`--- >${collectionName} Added (${added.length}) ---`);
    added.forEach(({ filePath, item }) => {
      log.info(`Added ${collectionName.slice(0, -1)} ${filePath}:`, item);
    });
  }

  // Log modified items
  if (modified.length > 0) {
    log.info(`--- >${collectionName} Modified (${modified.length}) ---`);
    modified.forEach(({ filePath, differences }) => {
      log.info(`Modified ${collectionName.slice(0, -1)} ${filePath}:`, differences);
    });
  }

  // Log deleted items
  if (deleted.length > 0) {
    log.info(`--- >${collectionName} Deleted (${deleted.length}) ---`);
    deleted.forEach(({ filePath, item }) => {
      log.info(`Deleted ${collectionName.slice(0, -1)} ${filePath}:`, item);
    });
  }

  log.info(`--- ${collectionName} ---`);
};

/**
 * A Map wrapper that logs differences whenever entries are added, updated, or deleted.
 */
export class LoggedMap<K, V> extends Map<K, V> {
  /**
   * Overrides the set method to include logging.
   * @param key The key of the element to add to the Map object.
   * @param value The value of the element to add to the Map object.
   * @returns The Map object.
   */
  set(key: K, value: V): this {
    const hasKey = this.has(key);
    const oldValue = this.get(key);
    super.set(key, value);
    if (!hasKey) {
      log.info(`Added entry to Map: Key = ${JSON.stringify(key)}, Value = ${JSON.stringify(value)}`);
    } else if (!isEqual(oldValue, value)) {
      log.info(
        `Updated entry in Map: Key = ${JSON.stringify(key)}, Before = ${JSON.stringify(
          oldValue,
        )}, After = ${JSON.stringify(value)}`,
      );
    }
    return this;
  }

  /**
   * Overrides the delete method to include logging.
   * @param key The key of the element to remove from the Map object.
   * @returns A boolean indicating whether an element in the Map object existed and has been removed successfully.
   */
  delete(key: K): boolean {
    if (this.has(key)) {
      const oldValue = this.get(key);
      const result = super.delete(key);
      if (result) {
        log.info(`Deleted entry from Map: Key = ${JSON.stringify(key)}, Value = ${JSON.stringify(oldValue)}`);
      }
      return result;
    }
    return false;
  }

  /**
   * Overrides the clear method to include logging for all deletions.
   */
  clear(): void {
    this.forEach((value, key) => {
      log.info(`Cleared entry from Map: Key = ${JSON.stringify(key)}, Value = ${JSON.stringify(value)}`);
    });
    super.clear();
  }
}
