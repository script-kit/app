/* eslint-disable */

import '@johnlindquist/kit';

console.log(
  `Patching node-pty with @homebridge/node-pty-prebuilt-multiarch ⛳️`
);

let ptyFilePath = path.resolve(process.env.PWD, 'src', 'pty.ts');

console.log({
  ptyFilePath,
});

let result = await replace({
  files: [ptyFilePath],
  from: "from 'node-pty'",
  to: "from '@homebridge/node-pty-prebuilt-multiarch'",
});

for (const entry of result) {
  if (entry.hasChanged && entry.file) {
    console.log(`Updated: ${entry.file} 🎉`);
  }
}

console.log(`Kit is fun!!! ❤️`);
