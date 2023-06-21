/* eslint-disable */

import '@johnlindquist/kit';

console.log(`Removing import ⛳️`);

let result = await replace({
  files: [srcFilePath],
  from: /REMOVE-NUT.*END-REMOVE-NUT/gs,
  to: 'REMOVED BY KIT',
});

console.log({ result });

console.log(`Kit is fun! ❤️`);
