import { Options } from 'react-hotkeys-hook';

const KEYS_TO_IGNORE_WHILE_IN_MONACO = ['Enter'];

export const hotkeysOptions: Options = {
  enableOnTags: ['INPUT', 'TEXTAREA', 'SELECT'],
  filterPreventDefault: false,
  filter: (event: KeyboardEvent) => {
    const target = event?.target as Element;
    if (
      // TODO: find a better way to identify that it's being triggered from monaco
      target?.classList.value.includes('monaco') &&
      KEYS_TO_IGNORE_WHILE_IN_MONACO.includes(event.code)
    ) {
      return false;
    }

    return true;
  },
};
