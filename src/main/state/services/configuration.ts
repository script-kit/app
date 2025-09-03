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
  /** Returns the Bonjour host to publish under (KIT_BONJOUR_HOST), defaults to 'kit.local'. */
  getBonjourHost(): string;
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

  getBonjourHost(): string {
    return (kitState?.kenvEnv as any)?.KIT_BONJOUR_HOST || 'kit.local';
  }
}
