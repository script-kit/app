import axios from 'axios';
import { kitState } from './state';

export enum TrackEvent {
  Ready = 'Ready',
  MainShortcut = 'MainShortcut',
  SetScript = 'SetScript',
  SetPrompt = 'SetPrompt',
  ScriptTrigger = 'ScriptTrigger',
  Error = 'Error',
}

export const trackEvent = (event: TrackEvent, properties: any) => {
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
