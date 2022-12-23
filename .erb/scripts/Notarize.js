const { spawn } = require('child_process');
const { notarize } = require('electron-notarize');
const { build } = require('../../package.json');

exports.default = async function notarizeMacos(context) {
  const { electronPlatformName, appOutDir } = context;
  if (electronPlatformName !== 'darwin') {
    return;
  }

  if (!process.env.CI) {
    console.warn('Skipping notarizing step. Packaging is not running in CI');
    return;
  }

  if (!('APPLE_ID' in process.env && 'APPLE_ID_PASS' in process.env)) {
    console.warn(
      'Skipping notarizing step. APPLE_ID and APPLE_ID_PASS env variables must be set'
    );
    return;
  }

  const appName = context.packager.appInfo.productFilename;
  const appPath = `${appOutDir}/${appName}.app`;

  try {
    await notarize({
      tool: 'notarytool',
      appBundleId: build.appId,
      appPath,
      appleId: process.env.APPLE_ID,
      appleIdPassword: process.env.APPLE_ID_PASS,
      teamId: '9822B7V7MD',
    });
  } catch (error) {
    if (error.message?.includes('Failed to staple')) {
      spawn(`xcrun`, ['stapler', 'staple', appPath]);
    } else {
      throw error;
    }
  }
};
