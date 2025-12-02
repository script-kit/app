// Shared helper to advance an index while skipping items marked with item.skip
export function advanceIndexSkipping(
  startIndex: number,
  direction: 1 | -1,
  items: Array<{ item?: { skip?: boolean } }>,
): number {
  let i = startIndex;
  let loopCount = 0;
  const len = items.length;

  if (len === 0) return 0;

  let choice = items[i]?.item;

  while (choice?.skip && loopCount < len) {
    i = (i + direction + len) % len;
    choice = items[i]?.item;
    loopCount++;
  }

  return i;
}
