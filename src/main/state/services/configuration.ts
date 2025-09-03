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
  /** Optional display id override (KIT_DISPLAY). */
  getDisplayId(): number | undefined;
  /** Auto-start built-in server (KIT_AUTOSTART_SERVER == 'true'). */
  isAutoStartServer(): boolean;
  /** Open-at-login preference (KIT_OPEN_AT_LOGIN !== 'false'). */
  isOpenAtLoginEnabled(): boolean;
  /** Desired number of idle prompt processes (KIT_IDLE_PROCESSES). */
  getIdleProcesses(): number;
  /** Preferred microphone device id (KIT_MIC). */
  getMicId(): string | undefined;
  /** Preferred webcam device id (KIT_WEBCAM). */
  getWebcamId(): string | undefined;
  /** Prompt background color (KIT_BACKGROUND_COLOR). */
  getBackgroundColor(): string | undefined;
  /** Prompt background material (KIT_BACKGROUND_MATERIAL). */
  getBackgroundMaterial(): string | undefined;
  /** Preferred prompt width (KIT_WIDTH). */
  getPreferredPromptWidth(): number | undefined;
  /** Returns true if dock should be disabled (KIT_DOCK === 'false'). */
  isDockDisabled(): boolean;
  /** Terminal font for renderer/term (KIT_TERM_FONT or default 'monospace'). */
  getTerminalFont(): string;
  /** Theme path for light or dark mode (KIT_THEME_LIGHT/KIT_THEME_DARK). */
  getThemePath(mode: 'light' | 'dark'): string | undefined;
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

  getDisplayId(): number | undefined {
    const raw = (kitState?.kenvEnv as any)?.KIT_DISPLAY;
    if (raw == null) return undefined;
    const n = Number(raw);
    return Number.isFinite(n) ? n : undefined;
  }

  isAutoStartServer(): boolean {
    return String((kitState?.kenvEnv as any)?.KIT_AUTOSTART_SERVER).toLowerCase() === 'true';
  }

  isOpenAtLoginEnabled(): boolean {
    // Default true unless explicitly 'false'
    const raw = (kitState?.kenvEnv as any)?.KIT_OPEN_AT_LOGIN;
    return String(raw).toLowerCase() !== 'false';
  }

  getIdleProcesses(): number {
    const raw = (kitState?.kenvEnv as any)?.KIT_IDLE_PROCESSES;
    const n = Number.parseInt(String(raw || '1'), 10);
    return Number.isFinite(n) && n > 0 ? n : 1;
  }

  getMicId(): string | undefined {
    return (kitState?.kenvEnv as any)?.KIT_MIC || undefined;
  }

  getWebcamId(): string | undefined {
    return (kitState?.kenvEnv as any)?.KIT_WEBCAM || undefined;
  }

  getBackgroundColor(): string | undefined {
    return (kitState?.kenvEnv as any)?.KIT_BACKGROUND_COLOR || undefined;
  }

  getBackgroundMaterial(): string | undefined {
    return (kitState?.kenvEnv as any)?.KIT_BACKGROUND_MATERIAL || undefined;
  }

  getPreferredPromptWidth(): number | undefined {
    const raw = (kitState?.kenvEnv as any)?.KIT_WIDTH;
    if (!raw) return undefined;
    const n = Number.parseInt(String(raw), 10);
    return Number.isFinite(n) ? n : undefined;
  }

  isDockDisabled(): boolean {
    return String((kitState?.kenvEnv as any)?.KIT_DOCK).toLowerCase() === 'false';
  }

  getTerminalFont(): string {
    return (kitState?.kenvEnv as any)?.KIT_TERM_FONT || 'monospace';
  }

  getThemePath(mode: 'light' | 'dark'): string | undefined {
    const env = (kitState?.kenvEnv as any) || {};
    return mode === 'dark' ? env.KIT_THEME_DARK : env.KIT_THEME_LIGHT;
  }
}
