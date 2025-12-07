import type { Channel } from '@johnlindquist/kit/core/enum';
import type { ChannelMap } from '@johnlindquist/kit/types/kitapp';
import { ipcMain } from 'electron';
import type { AppChannel } from '../shared/enums';
import type { KitPrompt } from './prompt';
import type { IPromptContext } from './prompt.types';

export function pingPrompt(prompt: KitPrompt, channel: AppChannel, data?: any) {
  prompt.logSilly(`sendToPrompt: ${String(channel)} ${data?.kitScript}`);
  return new Promise((resolve) => {
    if (prompt.window && !prompt.window.isDestroyed() && prompt.window?.webContents) {
      ipcMain.once(channel as any, () => {
        prompt.logInfo(`🎤 ${channel} !!! <<<<`);
        resolve(true);
      });
      const ctx = prompt as IPromptContext;
      ctx.sendToPrompt(channel as any as Channel, data);
    }
  });
}

export function getFromPrompt<K extends keyof ChannelMap>(
  prompt: KitPrompt,
  child: any,
  channel: K,
  data?: ChannelMap[K],
) {
  if (process.env.KIT_SILLY) {
    prompt.logSilly(`sendToPrompt: ${String(channel)}`, data);
  }
  if (prompt.window && !prompt.window.isDestroyed() && prompt.window?.webContents) {
    ipcMain.removeAllListeners(String(channel));
    ipcMain.once(String(channel), (_event, { value }) => {
      prompt.logSilly(`getFromPrompt: ${String(channel)}`, value);
      try {
        if (child?.connected) {
          child.send({ channel, value });
        }
      } catch (error) {
        prompt.logError('childSend error', error);
      }
    });
    prompt.window?.webContents.send(String(channel), data);
  }
}
