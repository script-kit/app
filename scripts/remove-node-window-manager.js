/* eslint-disable */

import '@johnlindquist/kit';

console.log(`Removing NODE-WINDOW-MANAGER ⛳️`);

let srcFilePath = path.resolve(process.env.PWD, 'src', '*').replace(/\\/g, '/');
console.log({
  mainFilePath: srcFilePath,
});

let result = await replace({
  files: [srcFilePath],
  from: /REMOVE-NODE_WINDOW_MANAGER.*?END-REMOVE-NODE_WINDOW_MANAGER/gs,
  to: 'REMOVED BY KIT',
});

console.log({ result });

console.log(`Kit is fun! ❤️`);
