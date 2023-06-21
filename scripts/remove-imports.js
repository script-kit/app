/* eslint-disable */

import '@johnlindquist/kit';

console.log(`Removing tick 🐞`);

let mainFilePath = path.resolve(process.env.PWD, 'src', '*');
console.log({
  mainFilePath,
});

let result = await replace({
  files: [mainFilePath],
  from: /KIT-REMOVE.*END-KIT-REMOVE/gs,
  to: 'REMOVED BY KIT',
});

console.log({ result });
