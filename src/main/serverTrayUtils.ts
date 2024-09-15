import { kitState } from './state';

/**
 * Retrieves the server port from the environment configuration.
 * Defaults to 3210 if not specified.
 */
export const getServerPort = (): number => {
  return kitState.kenvEnv?.KIT_API_PORT || 3210;
};
