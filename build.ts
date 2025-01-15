import '@johnlindquist/kit';
import fsExtra from 'fs-extra';
import { external, include } from './src/main/shims';
import { Arch, Platform, build } from 'electron-builder';
import type { Configuration, PackagerOptions } from 'electron-builder';
import packageJson from './package.json';

let platform: 'linux' | 'mac' | 'win';
let arch: 'arm64' | 'x64' | 'both';
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

  arch = process.arch as 'arm64' | 'x64' | 'both';
  publish = undefined;
} else {
  platform = (await arg('platform')) as 'linux' | 'mac' | 'win';
  arch = (await arg('arch')) as 'arm64' | 'x64' | 'both';
  publish = (await arg('publish')) as 'always' | 'never' | undefined;
}

const electronVersion = packageJson.devDependencies.electron.replace('^', '');

const onlyModules = include();

console.log(`🛠️ Building for ${platform} ${arch} ${publish} using ${electronVersion}`);

console.log(`Will only build: ${onlyModules}`);

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
  // afterSign: platform === 'mac' ? afterSign : undefined,
  files,
  nsis: {
    oneClick: false,
    perMachine: false,
    allowToChangeInstallationDirectory: true,
    shortcutName: 'Script Kit',
  },
  mac: {
    notarize: true,
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

let targets: PackagerOptions['targets'] = new Map();

switch (platform) {
  case 'mac':
    targets.set(
      Platform.MAC,
      new Map([
        [Arch.x64, ['dmg', 'zip']],
        [Arch.arm64, ['dmg', 'zip']],
      ]),
    );
    break;
  case 'win':
    targets.set(Platform.WINDOWS, new Map([[Arch[arch], ['nsis']]]));
    break;
  case 'linux':
    targets.set(Platform.LINUX, new Map([[Arch[arch], ['AppImage', 'deb', 'rpm']]]));
    break;
  default:
    throw new Error(`Unsupported platform: ${platform}`);
}

console.log('Building with config');
try {
  const uninstallDeps = external();
  console.log(`Removing external dependencies: ${uninstallDeps.join(', ')} before @electron/rebuild kicks in`);
  console.log(process.platform, process.arch, process.cwd());

  if (uninstallDeps.length > 0) {
    const pkg = await fsExtra.readJson('package.json');
    console.log(`Optional dependencies before: ${JSON.stringify(pkg.optionalDependencies, null, 2)}`);
  }
  const cliOptions = {
    config,
    publish,
    targets,
  };

  console.log('Building with options', cliOptions);
  const result = await build(cliOptions);
  console.log('Build result', result);
} catch (e) {
  console.error('Build failed', e);
  process.exit(1);
}
