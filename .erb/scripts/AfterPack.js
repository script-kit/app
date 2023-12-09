const path = require('path');
const { execSync } = require('child_process');

exports.default = async function afterPack(context) {
  const { appOutDir, electronPlatformName, arch } = context;

  // Only rebuild for Linux ARM64
  if (electronPlatformName === 'linux') {
    const rebuildCmd = `./node_modules/.bin/electron-rebuild --arch=${arch} --module-dir ${path.join(
      appOutDir,
      'resources',
      'app'
    )}`;
    execSync(rebuildCmd, { stdio: 'inherit' });
  }
};
