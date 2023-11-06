import log from 'electron-log';
import { ChannelMap } from '@johnlindquist/kit/types/kitapp';
import { AppChannel } from './enums';
import { windows } from './state';

export const sendToPrompt = <K extends keyof ChannelMap>(
  channel: K,
  data?: ChannelMap[K]
) => {
  const window = windows.get(0);
  if (process.env.KIT_SILLY) log.info(`sendToPrompt: ${String(channel)}`, data);
  // log.info(`>_ ${channel}`);
  if (window && !window.isDestroyed() && window?.webContents) {
    if (channel) {
      window?.webContents.send(String(channel), data);
    } else {
      log.error(`channel is undefined`, { data });
    }
  }
};

export const appToPrompt = (channel: AppChannel, data?: any) => {
  log.silly(`appToPrompt: ${String(channel)} ${data?.kitScript}`);
  const window = windows.get(0);

  if (window && !window.isDestroyed() && window?.webContents) {
    window?.webContents.send(channel, data);
  }
};
