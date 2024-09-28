/* eslint-disable */

console.log('Removing tick 🐞');

const srcFilePath = path.resolve(process.env.PWD, 'src', '**', '*').replace(/\\/g, '/');
console.log({
  mainFilePath: srcFilePath,
});

const result = await replace({
  files: [srcFilePath],
  from: './tick',
  to: './no-tick',
});

for (const entry of result) {
  if (entry.hasChanged && entry.file) {
    console.log(`Updated: ${entry.file} 🎉`);
  }
}

const tickFilePath = path.resolve(process.env.PWD, 'src', 'tick.ts');
await rm(tickFilePath);
