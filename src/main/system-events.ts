import type { Script } from '@johnlindquist/kit/types/core';
import { powerMonitor } from 'electron';
import { systemLog as log } from './logs';
import { Trigger } from '../shared/enums';
import { runPromptProcess } from './kit';
import { kitState } from './state';
import { debounce } from 'lodash-es';

// Define using the original type to ensure compatibility with powerMonitor methods
const validSystemEvents = [
  'suspend',
  'resume',
  'on-ac',
  'on-battery',
  'shutdown',
  'lock-screen',
  'unlock-screen',
  'user-did-become-active',
  'user-did-resign-active',
] as Parameters<typeof powerMonitor.addListener>[0][];

type SystemEventName = (typeof validSystemEvents)[number];

const debouncedRunPromptProcess = debounce(
  (scriptPath: string) => {
    runPromptProcess(scriptPath, [], {
      force: false,
      trigger: Trigger.System,
      sponsorCheck: false,
    });
  },
  250,
  { leading: true, trailing: false },
);

const systemEventMap = new Map<string, Map<SystemEventName, () => void>>();

export const unlinkEvents = (filePath: string) => {
  log.info(`[UNLINK_EVENTS] Attempting to unlink events for: "${filePath}"`);
  const scriptHandlers = systemEventMap.get(filePath);

  if (scriptHandlers) {
    log.info(`[UNLINK_EVENTS] Found ${scriptHandlers.size} events to unlink for "${filePath}".`);
    for (const [eventName, handler] of scriptHandlers.entries()) {
      try {
        powerMonitor.removeListener(eventName, handler);
        log.info(`[UNLINK_EVENTS] Successfully removed listener for "${eventName}" on "${filePath}".`);
      } catch (error) {
        log.error(`[UNLINK_EVENTS] Error removing listener for "${eventName}" on "${filePath}":`, error);
      }
    }
    systemEventMap.delete(filePath);
    log.info(`[UNLINK_EVENTS] Removed entry for "${filePath}" from systemEventMap.`);
  } else {
    log.info(`[UNLINK_EVENTS] No events found for "${filePath}" in map, nothing to unlink.`);
  }
};

export const systemScriptChanged = ({ filePath, kenv, system: systemEventsString }: Script) => {
  log.info(`[SCRIPT_CHANGED] Processing "${filePath}" with events: "${systemEventsString || 'none'}"`);

  unlinkEvents(filePath);

  if (kenv && kenv !== '' && !kitState.trustedKenvs.includes(kenv)) {
    if (systemEventsString) {
      log.info(`[SCRIPT_CHANGED] Ignoring "${filePath}" // System metadata: not in a trusted kenv.`);
      log.info(`[SCRIPT_CHANGED] Add "${kitState.trustedKenvsKey}=${kenv}" to your .env file to trust it.`);
    }
    return;
  }

  if (systemEventsString) {
    const systemEvents = systemEventsString.split(' ').filter(Boolean) as SystemEventName[];
    const scriptHandlers = new Map<SystemEventName, () => void>();

    let validEventsFound = false;
    for (const eventName of systemEvents) {
      if (validSystemEvents.includes(eventName)) {
        const handler = () => {
          if (systemEventMap.has(filePath) && systemEventMap.get(filePath)?.has(eventName)) {
            log.info(`[EVENT_HANDLER] 🗺 "${eventName}" triggered for "${filePath}"`);
            debouncedRunPromptProcess(filePath);
          } else {
            log.warn(
              `[EVENT_HANDLER] 🗺 "${eventName}" triggered, but "${filePath}" no longer registered for it. Ignoring.`,
            );
          }
        };

        try {
          powerMonitor.addListener(eventName, handler);
          scriptHandlers.set(eventName, handler);
          log.info(`[SCRIPT_CHANGED] Successfully added listener for "${eventName}" on "${filePath}".`);
          validEventsFound = true;
        } catch (error) {
          log.error(`[SCRIPT_CHANGED] Error adding listener for "${eventName}" on "${filePath}":`, error);
        }
      } else {
        log.warn(`[SCRIPT_CHANGED] Found invalid system event "${eventName}" in "${filePath}". Skipping.`);
      }
    }

    if (validEventsFound) {
      systemEventMap.set(filePath, scriptHandlers);
      log.info(`[SCRIPT_CHANGED] Updated systemEventMap for "${filePath}" with ${scriptHandlers.size} handlers.`);
    }
  } else {
    log.info(`[SCRIPT_CHANGED] No system events specified for "${filePath}". Ensure any old listeners were removed.`);
  }
};

export const systemEventsSelfCheck = () => {
  log.info('🔍 [SYSTEM_SELF_CHECK] Starting system events self-check...');

  const shouldBeRegistered = new Map<string, Set<SystemEventName>>();

  for (const [filePath, script] of kitState.scripts) {
    const hasSystemEvents = Boolean(script.system);
    const isTrusted = !script.kenv || script.kenv === '' || kitState.trustedKenvs.includes(script.kenv);

    if (hasSystemEvents && isTrusted) {
      const expectedEvents = new Set(
        (script?.system?.split(' ').filter(Boolean) || []).filter((e): e is SystemEventName =>
          validSystemEvents.includes(e as any),
        ),
      );
      if (expectedEvents.size > 0) {
        shouldBeRegistered.set(filePath, expectedEvents);
      }
    }
  }

  for (const [filePath, registeredHandlers] of systemEventMap.entries()) {
    const registeredEvents = new Set(registeredHandlers.keys());
    const expectedEvents = shouldBeRegistered.get(filePath);

    if (!expectedEvents) {
      log.warn(`[SYSTEM_SELF_CHECK] Script "${filePath}" has listeners but shouldn't. Unlinking...`);
      unlinkEvents(filePath);
    } else {
      let mismatch = false;
      if (registeredEvents.size !== expectedEvents.size) {
        mismatch = true;
      } else {
        for (const event of expectedEvents) {
          if (!registeredEvents.has(event)) {
            mismatch = true;
            break;
          }
        }
      }

      if (mismatch) {
        log.warn(
          `[SYSTEM_SELF_CHECK] Mismatch for "${filePath}". Expected: ${[...expectedEvents].join(', ')}. Found: ${[...registeredEvents].join(', ')}. Re-registering...`,
        );
        const script = kitState.scripts.get(filePath);
        if (script) {
          systemScriptChanged(script);
        } else {
          log.error(`[SYSTEM_SELF_CHECK] Script "${filePath}" not found in kitState during re-registration!`);
          unlinkEvents(filePath);
        }
      } else {
        log.info(`[SYSTEM_SELF_CHECK] Script "${filePath}" events correctly registered.`);
      }
    }
  }

  for (const [filePath, expectedEvents] of shouldBeRegistered.entries()) {
    if (!systemEventMap.has(filePath)) {
      log.info(`[SYSTEM_SELF_CHECK] Missing registration for "${filePath}". Registering...`);
      const script = kitState.scripts.get(filePath);
      if (script) {
        systemScriptChanged(script);
      } else {
        log.error(`[SYSTEM_SELF_CHECK] Script "${filePath}" not found in kitState during initial registration!`);
      }
    }
  }
  log.info('✅ [SYSTEM_SELF_CHECK] Finished system events self-check.');
};
