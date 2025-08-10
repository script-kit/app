/**
 * Miscellaneous utility atoms.
 * Simple atoms that don't fit into other categories.
 */

import { atom } from 'jotai';
import { Channel, UI } from '@johnlindquist/kit/core/enum';
import { AppChannel } from '../../../../shared/enums';

// Import dependencies from facade
import { channelAtom, uiAtom } from '../facade';

const { ipcRenderer } = window.electron;

/**
 * Change atom - sends value change events through the channel.
 */
export const changeAtom = atom((g) => (data: any) => {
  const channel = g(channelAtom);
  channel(Channel.CHANGE, { value: data });
});

/**
 * Run main script atom - triggers the main script execution.
 */
export const runMainScriptAtom = atom(() => () => {
  ipcRenderer.send(AppChannel.RUN_MAIN_SCRIPT);
});

/**
 * Paste event handler atom.
 */
export const onPasteAtom = atom((g) => (event: ClipboardEvent) => {
  if (g(uiAtom) === UI.editor) {
    event.preventDefault(); // Assuming we want to handle paste manually or let Monaco handle it
  }
  const channel = g(channelAtom);
  channel(Channel.ON_PASTE);
});

/**
 * Drop event handler atom.
 */
export const onDropAtom = atom((g) => (event: DragEvent) => {
  if (g(uiAtom) === UI.drop) return; // UI.drop likely has its own specific handler
  event.preventDefault();
  let drop = '';
  const files = Array.from(event?.dataTransfer?.files || []);
  if (files.length > 0) {
    drop = files
      .map((file: File) => (file as any).path)
      .join('\n')
      .trim();
  } else {
    drop = event?.dataTransfer?.getData('URL') || event?.dataTransfer?.getData('Text') || '';
  }
  const channel = g(channelAtom);
  channel(Channel.ON_DROP, { drop });
});