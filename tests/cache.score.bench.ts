import { bench, describe } from 'vitest';
import { scoreAndCacheMainChoices } from '../src/main/install';

// Cheap factory to mimic your Script objects
const makeScripts = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    filePath: `/fake/script-${i}.ts`,
    name: `script-${i}`,
    // Add only the props your function reads
  })) as any;

describe('main-menu scoring', () => {
  bench('100 scripts', () => {
    scoreAndCacheMainChoices(makeScripts(100));
  });

  bench('10 000 scripts', () => {
    scoreAndCacheMainChoices(makeScripts(10_000));
  });
});
