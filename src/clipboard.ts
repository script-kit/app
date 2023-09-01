import log from 'electron-log';
import { Choice, Script } from '@johnlindquist/kit/types';
import { tmpClipboardDir, kitPath } from '@johnlindquist/kit/cjs/utils';
import { debounce, remove } from 'lodash';
import { kitState, kitClipboard } from './state';

export interface ClipboardItem extends Choice {
  type: string;
  timestamp: string;
  maybeSecret: boolean;
  value: any;
}

export const getClipboardHistory = async () => {
  const history = await kitClipboard.store.get('history');
  if (kitState.isMac && kitState?.kenvEnv?.KIT_ACCESSIBILITY !== 'true') {
    const choice = {
      name: `Clipboard history requires accessibility access`,
      description: `Unable to read clipboard history`,
      value: '__not-authorized__',
    };
    log.info(choice);

    await kitClipboard.store.set('history', [choice, ...history]);
  }

  return [];
};

export const removeFromClipboardHistory = async (itemId: string) => {
  const clipboardHistory = await kitClipboard.store.get('history');
  const index = clipboardHistory.findIndex(({ id }) => itemId === id);
  if (index > -1) {
    clipboardHistory.splice(index, 1);
  } else {
    log.info(`😅 Could not find ${itemId} in clipboard history`);
  }

  await kitClipboard.store.set('history', clipboardHistory);
};

export const clearClipboardHistory = () => {
  kitClipboard.store.set('history', []);
};

export const addToClipboardHistory = async (clipboardItem: ClipboardItem) => {
  const clipboardHistory = await kitClipboard.store.get('history');

  remove(
    clipboardHistory,
    (item: ClipboardItem) => item.value === clipboardItem?.value
  );

  log.silly(`📋 Clipboard`, clipboardItem);

  clipboardHistory.unshift(clipboardItem);
  const maxHistory = kitState?.kenvEnv?.KIT_CLIPBOARD_HISTORY_LIMIT
    ? parseInt(kitState?.kenvEnv?.KIT_CLIPBOARD_HISTORY_LIMIT, 10)
    : 100;

  if (
    // eslint-disable-next-line no-constant-condition
    clipboardHistory.length > maxHistory
  ) {
    clipboardHistory.pop();
  }

  log.info(`📋 Clipboard history: ${clipboardHistory.length}/${maxHistory}`);

  await kitClipboard.store.set('history', clipboardHistory);
};

export const syncClipboardStore = async () => {
  await new Promise((resolve) => {
    setTimeout(resolve, 200);
  });
  store(kitPath('db', 'clipboard.json'), {
    history: [],
  })
    .then((s) => {
      log.info(`📋 Clipboard store initialized: ${typeof s}`);
      kitClipboard.store = s;
      return s;
    })
    .catch((error) => {
      log.error(error);
    });
};
