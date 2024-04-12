/* eslint-disable */

import '@johnlindquist/kit';

console.log(`Removing REMOVE-MAC ⛳️`);

let srcFilePath = path
  .resolve(process.env?.PWD || '', 'src', '**', '*')
  .replace(/\\/g, '/');
console.log({
  mainFilePath: srcFilePath,
});

let result = await replace({
  files: [srcFilePath],
  from: /REMOVE-MAC.*?END-REMOVE-MAC/gs,
  to: 'REMOVED BY KIT',
});

for (const entry of result) {
  if (entry.hasChanged && entry.file) {
    console.log(`Updated: ${entry.file} 🎉`);
  }
}

console.log(`Kit is fun!!! ❤️`);
