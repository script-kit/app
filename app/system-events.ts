import { powerMonitor } from 'electron';
import log from 'electron-log';
import { Script } from '@johnlindquist/kit/types/cjs';
import { runPromptProcess } from './kit';
import { Trigger } from '@johnlindquist/kit/cjs/enum';

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
          log.info(`🗺`, { mappedEvent, scriptPath });
          runPromptProcess(scriptPath, [], {
            force: false,
            trigger: Trigger.System,
          });
        }
      });
    });
  };
  powerMonitor.addListener(systemEvent, systemEventHandler);
});

export const unlinkEvents = (filePath: string) => {
  if (systemEventMap.get(filePath)) {
    log.info(`Removed ${systemEventMap.get(filePath)}from ${filePath}`);
    systemEventMap.delete(filePath);
  }
};
export const systemScriptChanged = ({
  filePath,
  kenv,
  system: systemEventsString,
}: Script) => {
  if (kenv !== '') return;
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
