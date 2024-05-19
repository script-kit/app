// REMOVE-NUT
import { Enigo } from '@johnlindquist/kit-enigo';
// END-REMOVE-NUT
let enigo: Enigo;
export const getEnigo = () => {
  // REMOVE-NUT
  if (!enigo) {
    enigo = new Enigo();
  }
  return enigo;
  // END-REMOVE-NUT
};
