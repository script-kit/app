import { powerMonitor } from 'electron';
import log from 'electron-log';
import { grep } from 'shelljs';
import { runSystemScript } from './kit';

const systemMarker = 'System: ';

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
] as const;

const systemEventMap = new Map();

// Thought this would work, but had to use any...
// type SystemEvent = typeof validSystemEvents[number];
validSystemEvents.forEach((systemEvent: any) => {
  const systemEventHandler = () => {
    systemEventMap.forEach((eventList, scriptPath) => {
      eventList.forEach((mappedEvent: string) => {
        if (mappedEvent === systemEvent) {
          runSystemScript(scriptPath);
        }
      });
    });
  };
  powerMonitor.addListener(systemEvent, systemEventHandler);
});

export const unlinkEvents = (filePath: string) => {
  log.info(`Removed ${systemEventMap.get(filePath)}from ${filePath}`);
  systemEventMap.delete(filePath);
};
export const updateEvents = (filePath: string) => {
  if (systemEventMap.get(filePath)) {
    log.info(`Clearing ${systemEventMap.get(filePath)} from ${filePath}`);
    systemEventMap.delete(filePath);
  }

  const { stdout } = grep(`^//\\s*${systemMarker}\\s*`, filePath);

  const systemEventsString = stdout
    .substring(0, stdout.indexOf('\n'))
    .substring(stdout.indexOf(systemMarker) + systemMarker.length)
    .trim();
  if (systemEventsString) {
    log.info({ systemEventsString });
    const systemEvents = systemEventsString.split(' ');

    const valid = systemEvents.every((event) =>
      validSystemEvents.includes(event as any)
    );

    if (valid) {
      log.info(`${systemEvents} will trigger ${filePath}`);
      systemEventMap.set(filePath, systemEvents);
    } else {
      systemEvents.forEach((event) => {
        if (!validSystemEvents.includes(event as any)) {
          log.warn(`Found invalid event ${event} in ${filePath}`);
        }
      });
    }
  }
};
