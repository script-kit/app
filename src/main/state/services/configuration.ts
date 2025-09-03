import { kitState } from '../../state';

/**
 * Narrow configuration surface for modules that need environment-backed values.
 * Start small and expand as real use-cases arise to avoid over‑engineering.
 */
export interface ConfigurationService {
  /** Returns the KIT_API_KEY used for protected HTTP/script access. */
  getApiKey(): string;
  /** Returns true if auto-updates should be disabled (KIT_DISABLE_AUTO_UPDATE). */
  isAutoUpdateDisabled(): boolean;
}

/**
 * Default adapter that reads from the existing global kitState.
 * This preserves backward compatibility while enabling DI in consumers.
 */
export class KitStateConfigurationAdapter implements ConfigurationService {
  getApiKey(): string {
    return kitState?.kenvEnv?.KIT_API_KEY || '';
  }

  isAutoUpdateDisabled(): boolean {
    const val = (kitState?.kenvEnv as any)?.KIT_DISABLE_AUTO_UPDATE;
    // Treat any truthy value or 'true' string as disabled
    return Boolean(val) && String(val).toLowerCase() !== 'false';
  }
}
