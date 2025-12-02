import type { ConfigurationService } from './configuration';
import { KitStateConfigurationAdapter } from './configuration';

/**
 * Extremely light-weight service container. Keeps defaults simple,
 * while allowing tests or future refactors to inject alternatives.
 */
class ScriptKitContainer {
  private static _instance: ScriptKitContainer | null = null;

  static instance(): ScriptKitContainer {
    if (!ScriptKitContainer._instance) ScriptKitContainer._instance = new ScriptKitContainer();
    return ScriptKitContainer._instance;
  }

  private _config: ConfigurationService | null = null;

  getConfig(): ConfigurationService {
    if (!this._config) {
      this._config = new KitStateConfigurationAdapter();
    }
    return this._config;
  }

  /**
   * Allow tests to inject fakes/mocks without touching consumers.
   */
  setConfig(service: ConfigurationService) {
    this._config = service;
  }
}

export const container = ScriptKitContainer.instance();
