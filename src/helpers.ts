/* eslint-disable no-useless-escape */
/* eslint-disable no-nested-ternary */
/* eslint-disable jest/no-export */
/* eslint-disable jest/expect-expect */

import v8 from 'v8';

export const APP_NAME = 'Kit';
export const KIT_PROTOCOL = 'kit';

export const structuredClone = (obj: any) => {
  return v8.deserialize(v8.serialize(obj));
};
