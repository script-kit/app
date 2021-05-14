/* eslint-disable import/prefer-default-export */
import { getLog } from './logs';
import { sendToPrompt, showPrompt } from './prompt';
import { SET_CHOICES, SET_HINT, SHOW_PROMPT } from './channels';

export type ChannelHandler = {
  [Property in keyof typeof import('./channels')]?: (data: any) => void;
};

export type MessageData = { channel: keyof typeof import('./channels') };

export const backgroundMessageMap: ChannelHandler = {
  CONSOLE_LOG: (data) => {
    console.log(data);
    getLog(data?.kitScript).info(data.log);
  },

  CONSOLE_WARN: (data) => {
    console.warn(data.log);
    getLog(data?.kitScript).warn(data.log);
  },

  SET_CHOICES: (data) => {
    sendToPrompt(SET_CHOICES, data);
  },

  SET_HINT: (data) => {
    sendToPrompt(SET_HINT, data);
  },

  SHOW_PROMPT: (data) => {
    showPrompt(data);
    sendToPrompt(SHOW_PROMPT, data);
  },
};

export const backgroundMessage = (data: MessageData) => {
  if (backgroundMessageMap[data?.channel]) {
    const channelFn = backgroundMessageMap[data.channel] as (data: any) => void;
    channelFn(data);
  } else {
    console.warn(`Channel ${data?.channel} not found on background.`);
  }
};
