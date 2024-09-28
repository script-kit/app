import { kitState } from "../state";

export const getApiKey = (): string => {
  return kitState.kenvEnv?.KIT_API_KEY || '';
};
