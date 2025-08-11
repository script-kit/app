/**
 * Theme and color utility atoms.
 * Handles color picking and theme-related functionality.
 */

import { atom } from 'jotai';
import { Channel } from '@johnlindquist/kit/core/enum';
import * as colorUtils from '@johnlindquist/kit/core/utils';

// Import dependencies directly from jotai.ts
import { pidAtom, channelAtom } from '../../jotai';

const { ipcRenderer } = window.electron;

/**
 * Color picker atom using the EyeDropper API.
 * Allows user to pick a color from anywhere on the screen.
 */
export const colorAtom = atom((g) => {
  return async () => {
    try {
      // @ts-ignore -- EyeDropper API might not be in standard TS types yet
      const eyeDropper = new EyeDropper();
      const { sRGBHex } = await eyeDropper.open();

      const color = colorUtils.convertColor(sRGBHex);
      const channel = Channel.GET_COLOR;
      const pid = g(pidAtom);

      const appMessage = {
        channel,
        pid: pid || 0,
        value: color,
      };

      ipcRenderer.send(channel, appMessage);
      return color;
    } catch (error) {
      // User cancelled or EyeDropper failed
      return '';
    }
  };
});