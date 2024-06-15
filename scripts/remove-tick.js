console.log(`Removing tick 🐞`);

let srcFilePath = path
  .resolve(process.env.PWD, 'src', '**', '*')
  .replace(/\\/g, '/');
console.log({
  mainFilePath: srcFilePath,
});

let result = await replace({
  files: [srcFilePath],
  from: './tick',
  to: './no-tick',
});

for (const entry of result) {
  if (entry.hasChanged && entry.file) {
    console.log(`Updated: ${entry.file} 🎉`);
  }
}

let tickFilePath = path.resolve(process.env.PWD, 'src', 'tick.ts');
await rm(tickFilePath);
