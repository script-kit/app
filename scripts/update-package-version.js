/* eslint-disable */

let packageJson = await readJson(path.resolve('src', 'package.json'));
packageJson.version = await arg('Enter the version number');
await writeJson(path.resolve('src', 'package.json'), packageJson);
