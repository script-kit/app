/* eslint-disable */

const packageJson = await readJson(path.resolve('package.json'));
packageJson.version = await arg('Enter the version number');
await writeJson(path.resolve('package.json'), packageJson);
