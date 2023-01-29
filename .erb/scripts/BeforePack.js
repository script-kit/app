const fs = require('fs');
const { readdir, rm } = require('fs/promises');
const { Arch, BeforePackContext } = require('electron-builder');

// Use jsdoc to type the context to BeforePackContext

/** @param {BeforePackContext} context */
exports.default = async function notarizeMacos(context) {
  let { electronPlatformName, appOutDir, arch } = context;
  let archCode = Object.entries(Arch).find(([key, value]) => value === arch)[0];

  await console.log(`>>> Before Pack:`, {
    electronPlatformName,
    appOutDir,
    arch,
  });

  // const win = electronPlatformName.startsWith('win');
  // const mac = electronPlatformName.startsWith('darwin');
  // const linux = electronPlatformName.startsWith('linux');
  // const arm64 = Arch.arm64 === arch;
  // const x64 = Arch.x64 === arch;

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

  const afterPkg = fs.readFileSync('./src/package.json', 'utf-8');
  console.log({ pkg: JSON.stringify(afterPkg.dependencies) });
};
