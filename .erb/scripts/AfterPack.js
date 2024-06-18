const path = require('node:path');
const { execSync } = require('node:child_process');
const { Arch } = require('electron-builder');

exports.default = async function afterPack(context) {
  const { appOutDir, electronPlatformName, arch } = context;

  const archName = Arch[arch];
  const cwd = process.cwd();

  console.log({
    cwd,
    appOutDir,
    electronPlatformName,
    archName,
  });

  if (electronPlatformName === 'linux') {
    const unpackedDir = path.join(appOutDir, 'resources', 'app.asar.unpacked');
    console.log(`Installing node-pty for ${archName} with yarn in ${unpackedDir}...`);

    // Change working directory to app.asar.unpacked
    process.chdir(unpackedDir);

    // Install node-pty using yarn in the app.asar.unpacked directory
    const installCmd = 'yarn add node-pty';
    execSync(installCmd, { stdio: 'inherit' });

    // Change back to the original working directory
    process.chdir(cwd);

    console.log(`Installed node-pty for ${archName} with yarn in ${unpackedDir} 📦`);
  }
};
