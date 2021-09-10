const { build } = require('../../package.json');
const fs = require('fs');
const download = require('download');
const { Arch } = require('electron-builder');

const VERSION =
  process.env.KIT_NODE_VERSION ||
  fs.readFileSync('./assets/node.txt', 'utf-8').trim();

exports.default = async function notarizeMacos(context) {
  /** @type typeof import("electron-builder").AfterPackContext */
  const { electronPlatformName, appOutDir, arch } = context;
  const archCode = Object.entries(Arch).find(
    ([key, value]) => value === arch
  )[0];

  console.log({ VERSION, archCode, electronPlatformName });
  const url = `https://nodejs.org/dist/${VERSION}/node-${VERSION}-${electronPlatformName}-${archCode}.tar.gz`;

  console.log(`Downloading ${url}`);

  fs.writeFileSync('./assets/arch.txt', archCode);
  fs.writeFileSync('./assets/platform.txt', electronPlatformName);
  fs.writeFileSync('./assets/node.tar.gz', await download(url));
};
