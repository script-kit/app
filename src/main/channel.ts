import type { ChannelMap } from '@johnlindquist/kit/types/kitapp';
import type { BrowserWindow } from 'electron';
import { AppChannel } from '../shared/enums';
import { createLogger } from './log-utils';
import type { ProcessAndPrompt } from './process';
import { prompts } from './prompts';

const log = createLogger('channel.ts');

export const sendToSpecificPrompt = <K extends keyof ChannelMap>(
  prompt: BrowserWindow,
  channel: K,
  data?: ChannelMap[K],
) => {
  log.info(`sendToFocusedPrompt: ${String(channel)}`, data);
  // log.info(`>_ ${channel}`);

  if (prompt && !prompt.isDestroyed() && prompt?.webContents) {
    if (channel) {
      prompt?.webContents.send(String(channel), data);
    } else {
      log.error('channel is undefined', { data });
    }
  }
};

export const sendToAllPrompts = <K extends keyof ChannelMap>(channel: K | AppChannel, data?: ChannelMap[K]) => {
  // log.info(`sendToAllPrompts: ${String(channel)}`, data);
  // log.info(`>_ ${channel}`);

  // Log [SCRIPTS RENDER] events
  if (channel === AppChannel.SET_CACHED_MAIN_STATE || 
      channel === AppChannel.SET_CACHED_MAIN_SCORED_CHOICES ||
      channel === AppChannel.SET_CACHED_MAIN_SHORTCUTS ||
      channel === AppChannel.SET_CACHED_MAIN_SCRIPT_FLAGS ||
      channel === AppChannel.SET_CACHED_MAIN_PREVIEW) {
    log.info(`[SCRIPTS RENDER] Broadcasting ${String(channel)} to ${prompts.length} prompts`);
  }

  for (const prompt of prompts) {
    if (prompt && !prompt.isDestroyed() && prompt?.window?.webContents) {
      const ignoreChannelsWhenOpen =
        channel === AppChannel.SET_CACHED_MAIN_PREVIEW || channel === AppChannel.INIT_PROMPT;
      if (channel === AppChannel.INIT_PROMPT) {
        log.info(`📤 sendToAllPrompts INIT_PROMPT: pid=${prompt.pid}, scriptPath="${prompt.scriptPath}", willIgnore=${Boolean(prompt.scriptPath && ignoreChannelsWhenOpen)}`);
      }
      if (prompt.scriptPath && ignoreChannelsWhenOpen) {
        log.info(`${prompt.pid}: 🏋️‍♂️ ignoring: ${channel} on ${prompt.scriptPath}`);
        continue;
      }
      if (channel) {
        // Log [SCRIPTS RENDER] per prompt
        if (channel === AppChannel.SET_CACHED_MAIN_STATE || 
            channel === AppChannel.SET_CACHED_MAIN_SCORED_CHOICES ||
            channel === AppChannel.SET_CACHED_MAIN_SHORTCUTS ||
            channel === AppChannel.SET_CACHED_MAIN_SCRIPT_FLAGS ||
            channel === AppChannel.SET_CACHED_MAIN_PREVIEW) {
          log.info(`[SCRIPTS RENDER] Sending ${String(channel)} to prompt ${prompt.pid}:${prompt.id}`);
        }
        // log.info(`${prompt.pid}: ${prompt.id}: ALL -> ${channel}`);
        prompt.sendToPrompt(channel, data);
      } else {
        log.error('channel is undefined', { data });
      }
    }
  }
};

export const createSendToChild = (pap: ProcessAndPrompt) => (data: any) => {
  try {
    if (pap?.child?.connected && data?.channel) {
      // data.promptId = pap?.promptId;
      // log.info(`${pap?.pid}: ${data.channel}`);
      pap?.child.send(data, (error) => {
        if (error) {
          log.warn(`${pap?.child?.pid}: ${data?.channel} couldn't send from ${data?.promptId}. Process already gone.`);
        }
      });
    }
  } catch (error) {
    log.error(`${data?.channel} childSend ERROR:`, pap?.promptId, data, error);
  }
};
