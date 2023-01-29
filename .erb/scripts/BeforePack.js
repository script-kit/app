const { readdir, rm, readFile, writeFile } = require('fs/promises');
const path = require('path');
const { Arch, BeforePackContext } = require('electron-builder');

// Use jsdoc to type the context to BeforePackContext

/** @param {BeforePackContext} context */
exports.default = async function notarizeMacos(context) {
  let { electronPlatformName, appOutDir, arch } = context;
  let archCode = Object.entries(Arch).find(([key, value]) => value === arch)[0];

  await console.log(`\n\n ---------- Before Pack:`, {
    electronPlatformName,
    appOutDir,
    arch,
  });

  const win = electronPlatformName.startsWith('win');
  const mac = electronPlatformName.startsWith('darwin');
  const linux = electronPlatformName.startsWith('linux');
  const arm64 = Arch.arm64 === arch;
  const x64 = Arch.x64 === arch;

  const srcPkgPath = path.resolve(appOutDir, '..', '..', 'src', 'package.json');

  if (linux || win) {
    // remove node-mac-permissions from package.json
    const pkg = await readFile(srcPkgPath, 'utf-8');
    const pkgJson = JSON.parse(pkg);
    console.log(`Deleting node-mac-permissions from package.json`);
    delete pkgJson.dependencies['node-mac-permissions'];
    await writeFile(srcPkgPath, JSON.stringify(pkgJson, null, 2));

    if (arm64) {
      // remove @nut-tree/nut-js from package.json
      delete pkgJson.dependencies['@nut-tree/nut-js'];
      await writeFile(srcPkgPath, JSON.stringify(pkgJson, null, 2));
    }
  }

  // // add @johnlindquist/kit to package.json
  // const pkg = fs.readFileSync('./package.json', 'utf-8');
  // const pkgJson = JSON.parse(pkg);

  // if (!mac) {
  //   const pkgJson = JSON.parse(pkg);
  //   console.log(`Deleting node-mac-permissions from package.json`);
  //   delete pkgJson.dependencies['node-mac-permissions'];
  //   fs.writeFileSync('./src/package.json', JSON.stringify(pkgJson, null, 2));
  // }

  // if (archCode === 'arm64' && (win || linux)) {
  //   const pkgJson = JSON.parse(pkg);
  //   console.log(`Deleting @nut-tree/nut-js from package.json`);
  //   delete pkgJson.dependencies['@nut-tree/nut-js'];
  //   fs.writeFileSync('./src/package.json', JSON.stringify(pkgJson, null, 2));
  // }

  const afterPkg = await readFile(srcPkgPath, 'utf-8');
  console.log({ pkg: JSON.stringify(afterPkg.dependencies) });
};
