const path = require('path');
const { execSync } = require('child_process');
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
    const rebuildCmd = `./node_modules/.bin/electron-rebuild --arch=${archName} --module-dir ${path.join(
      appOutDir,
      'resources',
      'src'
    )}`;
    execSync(rebuildCmd, { stdio: 'inherit' });
  }
};
