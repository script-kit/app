import '@johnlindquist/kit';
import { execSync } from 'node:child_process';
import fsExtra from 'fs-extra';
import { external, include } from './src/main/shims';

import { Arch, Platform, build } from 'electron-builder';
import type { AfterPackContext, Configuration, PackagerOptions } from 'electron-builder';
import packageJson from './package.json';

let platform: 'linux' | 'mac' | 'win';
let arch: 'arm64' | 'x64';
let publish: 'always' | 'never' | undefined;

if (process.argv.length <= 2) {
  if (process.platform === 'darwin') {
    platform = 'mac';
  } else if (process.platform === 'win32') {
    platform = 'win';
  } else if (process.platform === 'linux') {
    platform = 'linux';
  } else {
    throw new Error(`Unsupported platform: ${process.platform}`);
  }

  arch = process.arch as 'arm64' | 'x64';
  publish = undefined;
} else {
  platform = (await arg('platform')) as 'linux' | 'mac' | 'win';
  arch = (await arg('arch')) as 'arm64' | 'x64';
  publish = (await arg('publish')) as 'always' | 'never' | undefined;
}

const electronVersion = packageJson.devDependencies.electron.replace('^', '');

const onlyModules = include();

console.log(`🛠️ Building for ${platform} ${arch} ${publish} using ${electronVersion}`);

console.log(`Will only build: ${onlyModules}`);

const afterSign = function notarizeMacos(context: AfterPackContext) {
  // console.log('Attempting notarization', context);
  // const { electronPlatformName, appOutDir } = context;
  // if (electronPlatformName !== 'darwin') {
  //   return;
  // }

  if (!process.env.CI) {
    console.warn('Skipping notarizing step. Packaging is not running in CI');
    return;
  }

  // if (!('APPLE_ID' in process.env && 'APPLE_ID_PASS' in process.env)) {
  //   console.warn('Skipping notarizing step. APPLE_ID and APPLE_ID_PASS env variables must be set');
  //   return;
  // }

  // const appName = context.packager.appInfo.productFilename;

  // console.log('Notarizing', appName);
  // console.log('Found envs:', {
  //   APPLE_ID: typeof process.env?.APPLE_ID,
  //   APPLE_ID_PASS: typeof process.env?.APPLE_ID_PASS,
  //   CSC_LINK: typeof process.env?.CSC_LINK,
  //   CSC_KEY_PASSWORD: typeof process.env?.CSC_KEY_PASSWORD,
  //   APPLE_APP_SPECIFIC_PASSWORD: typeof process.env?.APPLE_APP_SPECIFIC_PASSWORD,
  // });

  // try {
  //   const notarizationResult = await notarize({
  //     tool: 'notarytool',
  //     appPath: `${appOutDir}/${appName}.app`,
  //     appleId: process.env?.APPLE_ID as string,
  //     appleIdPassword: process.env?.APPLE_ID_PASS as string,
  //     teamId: '9822B7V7MD',
  //   });
  //   console.log('Notarization result', notarizationResult);
  // } catch (e) {
  //   console.error('Notarization failed', e);
  //   process.exit(1);
  // }

  // Verify the app is signed

  const { appOutDir } = context; // This is the path to the unpacked app
  const { productFilename } = context.packager.appInfo; // This is the name of the app

  console.log(`Verifying "${appOutDir}/${productFilename}.app"`);
  const result = execSync(`codesign --verify --deep --strict --verbose=2 "${appOutDir}/${productFilename}.app"`, {
    stdio: 'inherit',
  });

  // Staple the notarization ticket to the app
  console.log(`Stapling notarization ticket to ${appOutDir}/${productFilename}.app`);
  try {
    execSync(`xcrun stapler staple "${appOutDir}/${productFilename}.app"`, {
      stdio: 'inherit',
    });
    console.log('Stapling completed successfully');
  } catch (error) {
    console.error('Error during stapling:', error);
    process.exit(1);
  }

  // Validate the stapling
  console.log(`Validating stapling for "${appOutDir}/${productFilename}.app"`);
  try {
    execSync(`xcrun stapler validate "${appOutDir}/${productFilename}.app"`, {
      stdio: 'inherit',
    });
    console.log('Stapling validation successful');
  } catch (error) {
    console.error('Error during stapling validation:', error);
    process.exit(1);
  }

  console.log('Codesign result', result);
};

const asarUnpack = ['assets/**/*'];

const dirFiles = (await fsExtra.readdir('.', { withFileTypes: true })).filter(
  (dir) =>
    !(
      dir.name.startsWith('out') ||
      dir.name.startsWith('node_modules') ||
      dir.name.startsWith('release') ||
      dir.name.startsWith('assets') ||
      dir.name.startsWith('package.json')
    ),
);
4;
// If directory, exclude with !directory**/*
// If file, exclude with !file
const files = dirFiles
  .filter((file) => file.isDirectory())
  .map((dir) => `!${dir.name}/**/*`)
  .concat(dirFiles.filter((file) => file.isFile()).map((file) => `!${file.name}`));

console.log({ files });

const config: Configuration = {
  appId: 'app.scriptkit', // Updated appId from package.json
  artifactName: '${productName}-macOS-${version}-${arch}.${ext}',
  productName: 'Script Kit', // Updated productName from package.json

  directories: {
    output: './release',
    buildResources: 'build',
  },
  asar: true,
  asarUnpack,
  afterSign: platform === 'mac' ? afterSign : undefined,
  files,
  nsis: {
    oneClick: false,
    perMachine: false,
    allowToChangeInstallationDirectory: true,
    shortcutName: 'Script Kit',
  },
  mac: {
    // notarize: {
    //   teamId: '9822B7V7MD',
    // },
    icon: 'assets/icons/mac/icon.icns',
    category: 'public.app-category.productivity', // Keep as is or update based on package.json if needed
    hardenedRuntime: true,
    entitlements: 'assets/entitlements.mac.plist',
    gatekeeperAssess: true,
    extendInfo: {
      CFBundleDocumentTypes: [
        {
          CFBundleTypeName: 'Folders',
          CFBundleTypeRole: 'Viewer',
          LSHandlerRank: 'Alternate',
          LSItemContentTypes: ['public.folder', 'com.apple.bundle', 'com.apple.package', 'com.apple.resolvable'],
        },
        {
          CFBundleTypeName: 'UnixExecutables',
          CFBundleTypeRole: 'Shell',
          LSHandlerRank: 'Alternate',
          LSItemContentTypes: ['public.unix-executable'],
        },
      ],
    },
  },
  win: {
    icon: 'assets/icon.png',
    artifactName: '${productName}-Windows-${version}-${arch}.${ext}',
  },
  linux: {
    icon: 'assets/icons/mac/icon.icns',
    category: 'Development',
    executableName: 'scriptkit',
    artifactName: '${productName}-Linux-${version}-${arch}.${ext}',
  },
  protocols: [
    {
      name: 'kit',
      schemes: ['kit'],
    },
  ],
  publish: {
    provider: 'github',
    owner: 'johnlindquist',
    repo: 'kitapp',
    releaseType: 'prerelease',
  },
};

let targets: PackagerOptions['targets'];
const archFlag = Arch[arch as 'x64' | 'arm64'];

switch (platform) {
  case 'mac':
    targets = Platform.MAC.createTarget(['dmg', 'zip'], archFlag);
    break;
  case 'win':
    targets = Platform.WINDOWS.createTarget(['nsis'], archFlag);
    break;
  case 'linux':
    targets = Platform.LINUX.createTarget(['AppImage', 'deb', 'rpm'], archFlag);
    break;
}

console.log('Building with config');
try {
  const result = await build({
    config,
    publish,
    targets,
  });
  console.log('Build result', result);
} catch (e) {
  console.error('Build failed', e);
  process.exit(1);
}
