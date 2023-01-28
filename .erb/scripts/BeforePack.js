const fs = require('fs');
const { Arch, BeforePackContext } = require('electron-builder');

// Use jsdoc to type the context to BeforePackContext

/** @param {BeforePackContext} context */
exports.default = async function notarizeMacos(context) {
  let { electronPlatformName, appOutDir, arch } = context;
  let archCode = Object.entries(Arch).find(([key, value]) => value === arch)[0];

  console.log(`>>> Before Pack:`, {
    electronPlatformName,
    appOutDir,
    arch,
  });
  if (electronPlatformName.startsWith('win')) {
    electronPlatformName = 'win';
    if (archCode.includes('64')) {
      archCode = 'x64';
    } else {
      archCode = 'x86';
    }
  }
  const win = electronPlatformName.startsWith('win');
  const mac = electronPlatformName.startsWith('darwin');
  const linux = electronPlatformName.startsWith('linux');

  // add @johnlindquist/kit to package.json
  const pkg = fs.readFileSync('./package.json', 'utf-8');
  const pkgJson = JSON.parse(pkg);
  console.log(`Adding @johnlindquist/kit to package.json`);
  pkgJson.dependencies['@johnlindquist/kit'] = 'latest';
  fs.writeFileSync('./package.json', JSON.stringify(pkgJson, null, 2));

  if (!mac) {
    const pkgJson = JSON.parse(pkg);
    console.log(`Deleting node-mac-permissions from package.json`);
    delete pkgJson.dependencies['node-mac-permissions'];
    fs.writeFileSync('./src/package.json', JSON.stringify(pkgJson, null, 2));
  }

  if (archCode === 'arm64' && (win || linux)) {
    const pkgJson = JSON.parse(pkg);
    console.log(`Deleting @nut-tree/nut-js from package.json`);
    delete pkgJson.dependencies['@nut-tree/nut-js'];
    fs.writeFileSync('./src/package.json', JSON.stringify(pkgJson, null, 2));
  }

  const pkg = fs.readFileSync('./src/package.json', 'utf-8');
  console.log({ pkg: JSON.parse(pkg.dependencies) });
};
