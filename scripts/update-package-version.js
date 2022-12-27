/* eslint-disable */

let packageJsonPath = path.resolve('package.json')
let packageJson = await readJson(packageJsonPath);

packageJson.version = await arg('Enter the version number');

await writeJson(path.resolve(packageJsonPath, packageJson);
