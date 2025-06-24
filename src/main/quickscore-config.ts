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

let QS_MIN_SCORE = kitState?.kenvEnv?.KIT_SEARCH_MIN_SCORE
  ? Number.parseFloat(kitState.kenvEnv.KIT_SEARCH_MIN_SCORE)
  : 0.6;

export const updateQuickScoreConfig = () => {
  QS_CONFIG = createConfig({
    wordSeparators: '-_',
    maxIterations:
      kitState?.kenvEnv?.KIT_SEARCH_MAX_ITERATIONS
        ? Number.parseInt(kitState.kenvEnv.KIT_SEARCH_MAX_ITERATIONS, 10)
        : 3,
  });
  
  QS_MIN_SCORE = kitState?.kenvEnv?.KIT_SEARCH_MIN_SCORE
    ? Number.parseFloat(kitState.kenvEnv.KIT_SEARCH_MIN_SCORE)
    : 0.6;
    
  log.info(`Updated QuickScore config - maxIterations: ${QS_CONFIG.maxIterations}, minScore: ${QS_MIN_SCORE}`);
};

export const getQuickScoreConfig = () => QS_CONFIG;
export const getQuickScoreMinScore = () => QS_MIN_SCORE;