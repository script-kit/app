import { powerMonitor } from 'electron';
import log from 'electron-log';
import { ProcessType } from './enums';
import { processes } from './process';
import { Script } from './types';

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
          console.log({ mappedEvent, scriptPath });
          processes.add(ProcessType.System, scriptPath);
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
export const systemScriptChanged = ({
  filePath,
  system: systemEventsString,
}: Script) => {
  if (systemEventMap.get(filePath)) {
    log.info(`Clearing ${systemEventMap.get(filePath)} from ${filePath}`);
    systemEventMap.delete(filePath);
  }

  if (systemEventsString) {
    const systemEvents = systemEventsString.split(' ');

    const valid = systemEvents.every((event) =>
      validSystemEvents.includes(event as any)
    );

    if (valid) {
      log.info(`🖥  ${systemEvents} will trigger ${filePath}`);
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
