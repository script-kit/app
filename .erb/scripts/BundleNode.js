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
  let { electronPlatformName, appOutDir, arch } = context;
  let archCode = Object.entries(Arch).find(([key, value]) => value === arch)[0];

  console.log({ VERSION, archCode, electronPlatformName });
  if (electronPlatformName.startsWith('win')) {
    electronPlatformName = 'win';
    if (archCode.includes('64')) {
      archCode = 'x64';
    } else {
      archCode = 'x86';
    }
  }

  // https://nodejs.org/dist/v17.2.0/node-v17.2.0-win-x86.zip
  // https://nodejs.org/dist/v17.2.0/node-v17.2.0-win-x64.zip
  // https://nodejs.org/dist/v17.2.0/node-v17.2.0-darwin-arm64.tar.gz
  const mac = electronPlatformName.startsWith('darwin');
  const url = `https://nodejs.org/dist/${VERSION}/node-${VERSION}-${electronPlatformName}-${archCode}.${
    mac ? 'tar.gz' : 'zip'
  }`;

  console.log(`Downloading ${url}`);

  const archTxt = 'arch.txt';
  const platformTxt = 'platform.txt';
  const nodeTxt = 'node.txt';
  const nodeTar = `node.${mac ? 'tar.gz' : 'zip'}`;
  const assetsPath = `${appOutDir}${
    electronPlatformName.startsWith('win')
      ? `/resources/assets/`
      : `/Kit.app/Contents/Resources/assets/`
  }`;

  fs.writeFileSync(`${assetsPath}${archTxt}`, archCode);
  fs.writeFileSync(`${assetsPath}${platformTxt}`, electronPlatformName);
  fs.writeFileSync(`${assetsPath}${nodeTar}`, await download(url));
  console.log(`✅ Download complete. Verifying...`);

  const assets = await readdir(assetsPath);
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
