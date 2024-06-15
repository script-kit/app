/* eslint-disable */

import '@johnlindquist/kit';

console.log(`Removing NUT ⛳️`);

let srcFilePath = path
  .resolve(process.env.PWD, 'src', '**', '*')
  .replace(/\\/g, '/');
console.log({
  mainFilePath: srcFilePath,
});

let result = await replace({
  files: [srcFilePath],
  from: /REMOVE-NUT.*?END-REMOVE-NUT/gs,
  to: 'REMOVED BY KIT',
});

for (const entry of result) {
  if (entry.hasChanged && entry.file) {
    console.log(`Updated: ${entry.file} 🎉`);
  }
}

console.log(`Kit is fun! 💛`);
