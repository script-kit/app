/* eslint-disable */

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
