/* eslint-disable */

import '@johnlindquist/kit';

console.log(`Removing REMOVE-MAC ⛳️`);

try {
  await exec(
    'npm un --force node-mac-permissions @johnlindquist/mac-clipboard-listener @johnlindquist/mac-frontmost @johnlindquist/mac-panel-window',
    { stdio: 'inherit' },
  );
  console.log('Successfully removed mac-specific packages.');
} catch (error) {
  console.error('Error removing mac-specific packages:', error);
}

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
