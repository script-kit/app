const { build } = require('../../package.json');
const fs = require('fs');
const { readdir, rm, writeFile } = require('fs/promises');

const download = require('download');
const { Arch } = require('electron-builder');

const VERSION =
  process.env.KIT_NODE_VERSION ||
  fs.readFileSync('./assets/node.txt', 'utf-8').trim();

exports.default = async function notarizeMacos(context) {
  console.log(`>>> AFTER PACK: - Bundle Node.js ${VERSION}`);

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
  const win = electronPlatformName.startsWith('win');
  const mac = electronPlatformName.startsWith('darwin');
  const linux = electronPlatformName.startsWith('linux');
  const extension = win ? 'zip' : 'tar.gz';
  const url = `https://nodejs.org/dist/${VERSION}/node-${VERSION}-${electronPlatformName}-${archCode}.${extension}`;

  console.log(`Downloading ${url}`);

  const archTxt = 'arch.txt';
  const platformTxt = 'platform.txt';
  const nodeTxt = 'node.txt';
  const nodeUrl = 'node_url.txt';
  const nodeTar = `node.${extension}`;
  const assetsPath = `${appOutDir}${
    mac ? `/Kit.app/Contents/Resources/assets/` : `/resources/assets/`
  }`;

  fs.writeFileSync(`${assetsPath}${archTxt}`, archCode);
  fs.writeFileSync(`${assetsPath}${platformTxt}`, electronPlatformName);
  fs.writeFileSync(`${assetsPath}node_url.txt`, url.trim());

  const buffer = await download(url);
  await writeFile(path.resolve(assetsPath, nodeTar), buffer);
  console.log(`✅ Download complete. Verifying...`);

  const assets = await readdir(assetsPath);
  console.log(assets);
  const hasArch = assets.includes(archTxt);
  const hasPlatform = assets.includes(platformTxt);
  const hasNodeTxt = assets.includes(nodeTxt);
  const hasNodeUrl = assets.includes(nodeUrl);

  if (!(hasArch && hasPlatform && hasNodeTxt && hasNodeUrl)) {
    console.log(`🔴 Oh no...`);
    process.exit(1);
  }

  const arm64 = Arch.arm64 === arch;
  const x64 = Arch.x64 === arch;

  // if (linux || win) {
  //   console.log(await readdir(`${appOutDir}/resources`));
  //   console.log(`--\n\n--`);
  //   console.log(await readdir(`${appOutDir}/resources/app.asar.unpacked`));
  //   console.log(`--\n\n--`);
  //   console.log(
  //     `Before:`,
  //     await readdir(`${appOutDir}/resources/app.asar.unpacked/node_modules`)
  //   );
  //   console.log(`--\n\n--`);
  //   await rm(
  //     `${appOutDir}/resources/app.asar.unpacked/node_modules/node-mac-permissions`,
  //     { recursive: true, force: true }
  //   );

  //   if (arm64) {
  //     await rm(
  //       `${appOutDir}/resources/app.asar.unpacked/node_modules/@nut-tree/nut-js`,
  //       { recursive: true, force: true }
  //     );
  //   }

  //   console.log(
  //     `After:`,
  //     await readdir(`${appOutDir}/resources/app.asar.unpacked/node_modules`)
  //   );
  //   console.log(`--\n\n--`);
  // }

  const pkg = fs.readFileSync('./src/package.json', 'utf-8');
  console.log({ pkg });
};
