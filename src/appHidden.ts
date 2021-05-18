import { app } from 'electron';

let appHidden = false;

export const setAppHidden = (hidden: boolean) => {
  appHidden = hidden;
  if (hidden) {
    app?.hide();
  }
};

export const getAppHidden = () => {
  return appHidden;
};
