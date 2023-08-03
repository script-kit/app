/* eslint-disable */

import '@johnlindquist/kit';

console.log(`Removing import ⛳️`);

let srcFilePath = path.resolve(process.env.PWD, 'src', '*').replace(/\\/g, '/');
console.log({
  mainFilePath: srcFilePath,
});

let result = await replace({
  files: [srcFilePath],
  from: /REMOVE-MAC.*?END-REMOVE-MAC/gs,
  to: 'REMOVED BY KIT',
});

console.log({ result });

console.log(`Kit is fun! ❤️`);
