import type { Script } from '@johnlindquist/kit/types/core';
import { powerMonitor } from 'electron';
import { systemLog as log } from './logs';
import { Trigger } from '../shared/enums';
import { runPromptProcess } from './kit';
import { kitState } from './state';
import { parseScript } from './db';
import { debounce } from 'lodash-es';

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

const systemEventMap = new Map();

// Create a debounced version of runPromptProcess with 250ms delay
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

// Initialize system event listeners
for (const systemEvent of validSystemEvents) {
  const systemEventHandler = () => {
    for (const [scriptPath, eventList] of systemEventMap) {
      for (const mappedEvent of eventList) {
        if (mappedEvent === systemEvent) {
          log.info('🗺', { mappedEvent, scriptPath });
          debouncedRunPromptProcess(scriptPath);
        }
      }
    }
  };
  powerMonitor.addListener(systemEvent, systemEventHandler);
}

export const unlinkEvents = (filePath: string) => {
  if (systemEventMap.get(filePath)) {
    log.info(`Removed ${systemEventMap.get(filePath)}from ${filePath}`);
    systemEventMap.delete(filePath);
  }
};

export const systemScriptChanged = ({ filePath, kenv, system: systemEventsString }: Script) => {
  // Check for duplicate registration
  if (systemEventMap.has(filePath)) {
    const existingEvents = systemEventMap.get(filePath);
    const newEvents = systemEventsString ? systemEventsString.split(' ') : [];
    if (JSON.stringify(existingEvents.sort()) === JSON.stringify(newEvents.sort())) {
      log.info(`No change in system events for ${filePath}; skipping re-registration.`);
      return;
    }
    log.info(`Clearing ${existingEvents} from ${filePath} for update.`);
    systemEventMap.delete(filePath);
  }

  if (kenv !== '' && !kitState.trustedKenvs.includes(kenv)) {
    if (systemEventsString) {
      log.info(`Ignoring ${filePath} // System metadata because it's not in a trusted kenv.`);
      log.info(`Add "${kitState.trustedKenvsKey}=${kenv}" to your .env file to trust it.`);
    }
    return;
  }

  if (systemEventsString) {
    const systemEvents = systemEventsString.split(' ');
    const valid = systemEvents.every((event) => validSystemEvents.includes(event as any));

    if (valid) {
      log.info(`🖥  ${systemEvents} will trigger ${filePath}`);
      systemEventMap.set(filePath, systemEvents);
    } else {
      for (const event of systemEvents) {
        if (!validSystemEvents.includes(event as any)) {
          log.warn(`Found invalid event ${event} in ${filePath}`);
        }
      }
    }
  }
};

export const systemEventsSelfCheck = () => {
  log.info('🔍 Starting system events self-check...');

  const shouldBeRegistered = new Map<string, string[]>();

  // For each script in kitState.scripts
  for (const [filePath, script] of kitState.scripts) {
    const hasSystemEvents = Boolean(script.system);
    const isTrusted = !script.kenv || script.kenv === '' || kitState.trustedKenvs.includes(script.kenv);

    if (hasSystemEvents && isTrusted) {
      const expectedEvents = script?.system?.split(' ') || [];
      shouldBeRegistered.set(filePath, expectedEvents);

      if (systemEventMap.has(filePath)) {
        const currentEvents = systemEventMap.get(filePath);
        const sortedCurrent = [...currentEvents].sort();
        const sortedExpected = [...expectedEvents].sort();

        if (JSON.stringify(sortedCurrent) !== JSON.stringify(sortedExpected)) {
          log.warn(
            `[SYSTEM SELF-CHECK] Script ${filePath}: expected events ${JSON.stringify(expectedEvents)}, but found ${JSON.stringify(currentEvents)}`,
          );
          systemScriptChanged(script);
        } else {
          log.info(`[SYSTEM SELF-CHECK] Script ${filePath}: events correctly registered`);
        }
      } else {
        log.info(`[SYSTEM SELF-CHECK] Missing registered system events for ${filePath}. Re-registering...`);
        systemScriptChanged(script);
      }
    }
  }

  // Unregister system events that are in systemEventMap but shouldn't be
  for (const filePath of systemEventMap.keys()) {
    if (!shouldBeRegistered.has(filePath)) {
      log.info(`[SYSTEM SELF-CHECK] No longer needs system events for ${filePath}. Un-registering...`);
      unlinkEvents(filePath);
    }
  }
};
