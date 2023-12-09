const path = require('path');
const { execSync } = require('child_process');
const { Arch } = require('electron-builder');

exports.default = async function afterPack(context) {
  const { appOutDir, electronPlatformName, arch } = context;

  const archName = Arch.arm64 ? 'arm64' : 'x64';
  // Only rebuild for Linux ARM64
  if (electronPlatformName === 'linux') {
    const rebuildCmd = `./node_modules/.bin/electron-rebuild --arch=${archName} --module-dir ${path.join(
      appOutDir,
      'resources',
      'app'
    )}`;
    execSync(rebuildCmd, { stdio: 'inherit' });
  }
};
