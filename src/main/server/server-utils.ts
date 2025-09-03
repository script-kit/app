import { container } from '../state/services/container';

export const getApiKey = (): string => container.getConfig().getApiKey();
