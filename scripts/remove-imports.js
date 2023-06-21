/* eslint-disable */

import '@johnlindquist/kit';

console.log(`Removing tick 🐞`);

let srcFilePath = path.resolve(process.env.PWD, 'src', '*');
console.log({
  mainFilePath: srcFilePath,
});

let noTickResult = await replace({
  files: [srcFilePath],
  from: './tick',
  to: './no-tick',
});

console.log({ noTickResult });

let tickFilePath = path.resolve(process.env.PWD, 'src', 'tick.ts');
await rm(tickFilePath);

let result = await replace({
  files: [srcFilePath],
  from: /KIT-REMOVE.*END-KIT-REMOVE/gs,
  to: 'REMOVED BY KIT',
});

console.log({ result });

console.log(`Kit is fun! ❤️`);
