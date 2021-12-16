/* eslint-disable import/prefer-default-export */
import { clipboard, NativeImage } from 'electron';
import { interval, merge } from 'rxjs';
import {
  distinctUntilChanged,
  filter,
  map,
  share,
  skip,
  tap,
} from 'rxjs/operators';

import { format } from 'date-fns';
import { writeFile } from 'fs/promises';
import path from 'path';
import { nanoid } from 'nanoid';
import { tmpClipboardDir } from '@johnlindquist/kit/cjs/utils';
import { Choice } from '@johnlindquist/kit/types/core';
import { Channel } from '@johnlindquist/kit/cjs/enum';

import { emitter } from './events';

interface ClipboardItem extends Choice {
  type: string;
  timestamp: string;
  maybeSecret: boolean;
}

let clipboardHistory: ClipboardItem[] = [];

export const getClipboardHistory = () => clipboardHistory;

export const removeFromClipboardHistory = (itemId: string) => {
  const index = clipboardHistory.findIndex(({ id }) => itemId === id);
  if (index) clipboardHistory.splice(index, 1);
};

export const configureInterval = async () => {
  const tick$ = interval(1000).pipe(share());

  const clipboardText$ = tick$.pipe(
    map(() => clipboard.readText()),
    filter(Boolean),
    skip(1),
    distinctUntilChanged()
  );

  let image: NativeImage | null = null;
  const clipboardImage$ = tick$.pipe(
    tap(() => {
      image = clipboard.readImage();
    }),
    filter(() => Boolean(image)),
    skip(1),
    map(() => image?.toDataURL()),
    filter((dataUrl) => !dataUrl?.endsWith(',')),
    distinctUntilChanged(),
    map(() => image)
  );

  merge(clipboardText$, clipboardImage$).subscribe(async (textOrImage) => {
    let value = '';
    let type = '';
    const timestamp = format(new Date(), 'yyyy-MM-dd-hh-mm-ss');

    if (typeof textOrImage === 'string') {
      type = 'text';
      value = textOrImage;
    } else {
      type = 'image';
      value = path.join(tmpClipboardDir, `${timestamp}.png`);
      await writeFile(value, (textOrImage as NativeImage).toPNG());
    }

    const maybeSecret = Boolean(
      type === 'text' &&
        value.match(/^(?=.*[0-9])(?=.*[a-zA-Z])([a-z0-9-]{5,})$/gi)
    );
    const clipboardItem = {
      id: nanoid(),
      name: type === 'image' ? value : value.trim().slice(0, 40),
      description: `${type}: ${timestamp}`,
      value,
      type,
      timestamp,
      maybeSecret,
    };
    clipboardHistory.unshift(clipboardItem);
    if (clipboardHistory.length > 100) {
      clipboardHistory.pop();
    }
  });

  emitter.on(Channel.REMOVE_CLIPBOARD_HISTORY_ITEM, (id) => {
    removeFromClipboardHistory(id);
  });

  emitter.on(Channel.CLEAR_CLIPBOARD_HISTORY, () => {
    clipboardHistory = [];
  });
};
