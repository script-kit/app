import axios from 'axios';
import { kitState } from './state';

export enum TrackEvent {
  Ready = 'Ready',
  MainShortcut = 'MainShortcut',
  SetPrompt = 'SetPrompt',
  ScriptTrigger = 'ScriptTrigger',
  Error = 'Error',
  Quit = 'Quit',
  LogError = 'LogError',
  ChildError = 'ChildError',
  MissingPackage = 'MissingPackage',
  DebugScript = 'DebugScript',
  ApplyUpdate = 'ApplyUpdate',
}

export const trackEvent = (event: TrackEvent, properties: any) => {
  if (kitState.kenvEnv?.KIT_DISABLE_TELEMETRY) return;
  axios
    .post(`${kitState.url}/api/usage`, {
      event,
      properties,
      device: {
        user_id: kitState.user_id,
        platform: kitState.platform,
        os_version: kitState.os_version,
        app_version: kitState.app_version,
      },
    })
    .then((response) => {
      // log.info(response.data);
      return response;
    })
    .catch((error) => {
      // log.error(error);
    });
};
