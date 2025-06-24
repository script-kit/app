import { createConfig } from 'quick-score';
import { kitState } from './state';
import { searchLog as log } from './logs';

let QS_CONFIG = createConfig({
  wordSeparators: '-_',
  maxIterations:
    kitState?.kenvEnv?.KIT_SEARCH_MAX_ITERATIONS
      ? Number.parseInt(kitState.kenvEnv.KIT_SEARCH_MAX_ITERATIONS, 10)
      : 3,
});

export const updateQuickScoreConfig = () => {
  QS_CONFIG = createConfig({
    wordSeparators: '-_',
    maxIterations:
      kitState?.kenvEnv?.KIT_SEARCH_MAX_ITERATIONS
        ? Number.parseInt(kitState.kenvEnv.KIT_SEARCH_MAX_ITERATIONS, 10)
        : 3,
  });
  log.info(`Updated QuickScore config with maxIterations: ${QS_CONFIG.maxIterations}`);
};

export const getQuickScoreConfig = () => QS_CONFIG;