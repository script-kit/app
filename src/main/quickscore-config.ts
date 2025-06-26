import { createConfig } from 'quick-score';
import { kitState } from './state';
import { searchLog as log } from './logs';

// Resolve environment overrides once and reuse the numeric value
const resolveMaxIterations = (): number =>
  kitState?.kenvEnv?.KIT_SEARCH_MAX_ITERATIONS
    ? Number.parseInt(kitState.kenvEnv.KIT_SEARCH_MAX_ITERATIONS, 10)
    : 3;

let QS_MAX_ITERATIONS = resolveMaxIterations();

let QS_CONFIG = createConfig({
  wordSeparators: '-_',
  maxIterations: QS_MAX_ITERATIONS,
});

let QS_MIN_SCORE = kitState?.kenvEnv?.KIT_SEARCH_MIN_SCORE
  ? Number.parseFloat(kitState.kenvEnv.KIT_SEARCH_MIN_SCORE)
  : 0.4;

export const updateQuickScoreConfig = () => {
  // Refresh values from environment
  QS_MAX_ITERATIONS = resolveMaxIterations();

  QS_CONFIG = createConfig({
    wordSeparators: '-_',
    maxIterations: QS_MAX_ITERATIONS,
  });

  QS_MIN_SCORE = kitState?.kenvEnv?.KIT_SEARCH_MIN_SCORE
    ? Number.parseFloat(kitState.kenvEnv.KIT_SEARCH_MIN_SCORE)
    : 0.4;

  log.info(`Updated QuickScore config - maxIterations: ${QS_MAX_ITERATIONS}, minScore: ${QS_MIN_SCORE}`);
};

export const getQuickScoreConfig = () => QS_CONFIG;
export const getQuickScoreMinScore = () => QS_MIN_SCORE;