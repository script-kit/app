import log from 'electron-log';
import { ChannelMap } from '@johnlindquist/kit/types/kitapp';
import { AppChannel } from '../shared/enums';
import { prompts } from '../shared/prompts';

export const sendToPrompt = <K extends keyof ChannelMap>(
  channel: K,
  data?: ChannelMap[K]
) => {
  const prompt = prompts.get(0);
  log.silly(`sendToPrompt: ${String(channel)}`, data);
  // log.info(`>_ ${channel}`);
  if (prompt && !prompt.isDestroyed() && prompt?.webContents) {
    if (channel) {
      prompt?.webContents.send(String(channel), data);
    } else {
      log.error(`channel is undefined`, { data });
    }
  }
};

export const appToPrompt = (channel: AppChannel, data?: any) => {
  log.silly(`appToPrompt: ${String(channel)} ${data?.kitScript}`);
  const prompt = prompts.get(0);

  if (prompt && !prompt.isDestroyed() && prompt?.webContents) {
    prompt?.webContents.send(channel, data);
  }
};
