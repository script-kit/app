import { kitState } from './state';

/**
 * Retrieves the server port from the environment configuration.
 * Defaults to 3210 if not specified.
 */
export const getServerPort = (): number => {
  return Number.parseInt(kitState.kenvEnv?.KIT_API_PORT || '3210', 10);
};

export const getMcpPort = (): number => {
  return Number.parseInt(kitState.kenvEnv?.KIT_MCP_PORT || '3580', 10);
};
