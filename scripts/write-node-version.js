const releases = require('electron-releases');

// get electron version from package.json
const version = require('../package.json').devDependencies.electron;

// find the electron release from the version
const release = releases.find((r) => r.tag_name === `v${version}`);

console.log({ version, release });

// get the node version from the release
const nodeVersion = release.deps.node;

// write node version to assets/node.txt
require('fs').writeFileSync('./assets/node.txt', `v${nodeVersion}`);
