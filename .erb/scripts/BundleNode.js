const { build } = require('../../package.json');
const fs = require('fs');
const { readdir } = require('fs/promises');
const download = require('download');
const { Arch } = require('electron-builder');

const VERSION =
  process.env.KIT_NODE_VERSION ||
  fs.readFileSync('./assets/node.txt', 'utf-8').trim();

exports.default = async function notarizeMacos(context) {
  console.log(`>>> AFTER PACK:`);

  /** @type typeof import("electron-builder").AfterPackContext */
  const { electronPlatformName, appOutDir, arch } = context;
  const archCode = Object.entries(Arch).find(
    ([key, value]) => value === arch
  )[0];

  console.log({ VERSION, archCode, electronPlatformName });
  const url = `https://nodejs.org/dist/${VERSION}/node-${VERSION}-${electronPlatformName}-${archCode}.tar.gz`;

  console.log(`Downloading ${url}`);

  const archTxt = 'arch.txt';
  const platformTxt = 'platform.txt';
  const nodeTxt = 'node.txt';
  const nodeTar = 'node.tar.gz';

  fs.writeFileSync(`./assets/${archTxt}`, archCode);
  fs.writeFileSync(`./assets/${platformTxt}`, electronPlatformName);
  fs.writeFileSync(`./assets/${nodeTar}`, await download(url));
  console.log(`✅ Download complete. Verifying...`);

  const assets = await readdir('./assets');
  console.log(assets);
  const hasArch = assets.includes(archTxt);
  const hasPlatform = assets.includes(platformTxt);
  const hasNodeTxt = assets.includes(nodeTxt);
  const hasNodeTar = assets.includes(nodeTar);

  if (!(hasArch && hasPlatform && hasNodeTxt && hasNodeTar)) {
    console.log(`🔴 Oh no...`);
    process.exit(1);
  }
};
