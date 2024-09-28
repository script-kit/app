import log from 'electron-log';
import { AppChannel } from '../shared/enums';
import { sendToAllPrompts } from './channel';

export const setCSSVariable = (name: string, value: undefined | string) => {
  if (value) {
    log.info('Setting CSS', name, value);
    // TODO: Implement "appToSpecificPrompt" for CSS Variables?
    sendToAllPrompts(AppChannel.CSS_VARIABLE, { name, value });
  }
};
