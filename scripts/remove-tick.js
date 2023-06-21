/* eslint-disable */

import '@johnlindquist/kit';

console.log(`Removing tick 🐞`);

let mainFilePath = path.resolve(process.env.PWD, 'src', 'main.dev.ts');
console.log({
  mainFilePath,
});

let result = await replace({
  files: [mainFilePath],
  from: './tick',
  to: './no-tick',
});

console.log({ result });

let newMainFile = await readFile(mainFilePath, 'utf-8');

console.log({ newMainFile });

let tickFilePath = path.resolve(process.env.PWD, 'src', 'tick.ts');
await rm(tickFilePath);
