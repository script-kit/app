import { snapshot } from 'valtio/vanilla';
import { kitState } from '../state';

/**
 * Produce a renderer-safe snapshot of kitState by removing sensitive/heavy fields.
 * Keep this logic centralized so both messages and future IPC paths share the same policy.
 */
export const sanitizeKitStateForIpc = () => {
  const s: any = snapshot(kitState);
  delete s.kenvEnv; // env variables may contain secrets
  delete s.user; // PII and identifiers
  delete s.KIT_NODE_PATH; // internal paths
  delete s.PNPM_KIT_NODE_PATH; // internal paths
  delete s.keymap; // large and not needed by most callers
  delete s.sleepClearKeys; // internal housekeeping
  if (Array.isArray(s.notifications) && s.notifications.length > 25) {
    s.notifications = s.notifications.slice(-25);
  }
  return s;
};
