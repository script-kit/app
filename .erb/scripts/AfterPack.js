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
    console.log(`Rebuilding node-pty for ${archName}...`);
    const rebuildCmd = `./node_modules/.bin/electron-rebuild --arch=${archName} --module-dir ${path.join(
      'src',
      'node_modules',
      'node-pty'
    )}`;
    execSync(rebuildCmd, { stdio: 'inherit' });
    console.log(`Rebuilt node-pty for ${archName} 🛠`);
  }
};
