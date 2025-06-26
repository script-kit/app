/**
 * A record of "original → { transformed, indexMap }"
 * indexMap[i] = absolute index in the ORIGINAL string that produced the i-th
 * character in the TRANSFORMED string.
 * Transforms strings to lowercase and strips hyphens (but preserves spaces).
 */
const normCache = new Map<string, { transformed: string; indexMap: number[] }>();

export function normalizeWithMap(raw: string): string {
  const cached = normCache.get(raw);
  if (cached) return cached.transformed;

  let transformed = "";
  const indexMap: number[] = [];

  for (let i = 0, j = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (ch === "-") continue;                         // strip hyphens but **remember**
    transformed += ch.toLocaleLowerCase();
    indexMap[j++] = i;                                // record origin
  }

  normCache.set(raw, { transformed, indexMap });
  return transformed;
}

/** Convert a [start,end) range on the *transformed* string back to the raw one */
export function remapRange(raw: string, range: [number, number]): [number, number] {
  const entry = normCache.get(raw);
  if (!entry) return range; // should not happen
  const [s, e] = range;
  
  // Handle empty range
  if (s === e) {
    return [entry.indexMap[s] || 0, (entry.indexMap[s] || 0) + 1];
  }
  
  return [entry.indexMap[s], entry.indexMap[e - 1] + 1]; // end is exclusive
}