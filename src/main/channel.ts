import log from 'electron-log';
import { ChannelMap } from '@johnlindquist/kit/types/kitapp';
import { AppChannel } from '../shared/enums';
import { BrowserWindow } from 'electron';
import { ProcessAndPrompt } from './process';

export const sendToSpecificPrompt = <K extends keyof ChannelMap>(
  prompt: BrowserWindow,
  channel: K,
  data?: ChannelMap[K]
) => {
  log.info(`sendToFocusedPrompt: ${String(channel)}`, data);
  // log.info(`>_ ${channel}`);

  if (prompt && !prompt.isDestroyed() && prompt?.webContents) {
    if (channel) {
      prompt?.webContents.send(String(channel), data);
    } else {
      log.error(`channel is undefined`, { data });
    }
  }
};

export const sendToAllPrompts = <K extends keyof ChannelMap>(
  channel: K,
  data?: ChannelMap[K]
) => {
  log.info(`sendToAllPrompts: ${String(channel)}`, data);
  // log.info(`>_ ${channel}`);

  const allPrompts = BrowserWindow.getAllWindows();
  for (const prompt of allPrompts) {
    if (prompt && !prompt.isDestroyed() && prompt.webContents) {
      if (channel) {
        prompt.webContents.send(String(channel), data);
      } else {
        log.error(`channel is undefined`, { data });
      }
    }
  }
};

export const appToAllPrompts = (channel: AppChannel, data?: any) => {
  log.info(`appToAllPrompts: ${String(channel)} ${data?.kitScript}`);

  const allPrompts = BrowserWindow.getAllWindows();
  for (const prompt of allPrompts) {
    if (prompt && !prompt.isDestroyed() && prompt.webContents) {
      prompt.webContents.send(channel, data);
    }
  }
};

export const createSendToPrompt =
  (prompt: BrowserWindow) =>
  <K extends keyof ChannelMap>(channel: K, data?: ChannelMap[K]) => {
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

export const appToSpecificPrompt = (
  prompt: BrowserWindow,
  channel: AppChannel,
  data?: any
) => {
  log.info(`appToPrompt: ${String(channel)} ${data?.kitScript}`);

  if (prompt && !prompt.isDestroyed() && prompt?.webContents) {
    prompt?.webContents.send(channel, data);
  }
};

export const createAppToPrompt =
  (prompt: BrowserWindow) => (channel: AppChannel, data?: any) => {
    log.silly(`appToPrompt: ${String(channel)} ${data?.kitScript}`);

    if (prompt && !prompt.isDestroyed() && prompt?.webContents) {
      prompt?.webContents.send(channel, data);
    }
  };

export const createSendToChild = (pap: ProcessAndPrompt) => (data: any) => {
  try {
    if (pap?.child && pap?.child?.connected && data?.channel) {
      data.promptId = pap?.promptId;
      // log.info(`✉️: ${data.channel}`);
      pap?.child.send(data, (error) => {
        if (error)
          log.warn(`Channel ${data?.channel} failed on ${data?.promptId}`);
      });
    }
  } catch (error) {
    log.error(`${data?.channel} childSend ERROR:`, pap?.promptId, data, error);
  }
};
