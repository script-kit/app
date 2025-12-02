import '@johnlindquist/kit';
import path from 'node:path';
import type { Configuration, PackagerOptions } from 'electron-builder';
import { Arch, build, Platform } from 'electron-builder';
import { execa } from 'execa';
import fsExtra from 'fs-extra';
import packageJson from './package.json';
import { external, include } from './src/main/shims';

console.log(`Building with config JSON.stringify(packageJson)`);

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

const stagingDir = '.dist-app';
const stagingPath = path.resolve(stagingDir);
const asarUnpack = ['assets/**/*'];
const requiredRuntimePackages = ['native-keymap', 'electron-log', 'valtio'] as const;
const pnpmVersionMatch = packageJson.packageManager?.match(/^pnpm@(.+)$/);
const pnpmVersion = pnpmVersionMatch?.[1];

const logStagingCopy = async (label: string, task: () => Promise<void>) => {
  console.log(`→ ${label}`);
  await task();
};

const copyIfExists = async (source: string, destination: string, { required } = { required: false }) => {
  if (await fsExtra.pathExists(source)) {
    await fsExtra.copy(source, destination, { dereference: true });
    return;
  }
  if (required) {
    throw new Error(`Required path '${source}' was not found. Did you run electron-vite build?`);
  }
  console.warn(`⚠️ Optional path '${source}' was not found; skipping copy.`);
};

const modulePath = (pkg: string) => path.join(stagingPath, 'node_modules', ...pkg.split('/'));

type RunPnpmOptions = {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
};

const runPnpm = async (args: string[], { cwd = process.cwd(), env: envOverrides = {} }: RunPnpmOptions = {}) => {
  const stdio: 'inherit' = 'inherit';
  const env = { ...process.env, ...envOverrides };
  const candidateBins = [
    path.join(cwd, 'node_modules', 'pnpm', 'bin', 'pnpm.cjs'),
    path.join(process.cwd(), 'node_modules', 'pnpm', 'bin', 'pnpm.cjs'),
  ];
  for (const candidate of candidateBins) {
    if (!(await fsExtra.pathExists(candidate))) continue;
    try {
      await execa(process.execPath, [candidate, ...args], {
        cwd,
        stdio,
        env,
      });
      console.log(`✅ Used local pnpm dependency for '${args.join(' ')}'`);
      return;
    } catch (localError) {
      console.warn(`Local pnpm execution failed, falling back to global resolution: ${localError}`);
    }
  }

  try {
    await execa('pnpm', args, {
      cwd,
      stdio,
      preferLocal: true,
      env,
    });
    return;
  } catch (error: any) {
    if (error.code !== 'ENOENT') {
      throw error;
    }
    console.warn('pnpm binary not found, retrying via corepack pnpm');
  }

  try {
    await execa('corepack', ['pnpm', ...args], { cwd, stdio, env });
    return;
  } catch (corepackError: any) {
    if (corepackError.code !== 'ENOENT') {
      throw corepackError;
    }
    if (!pnpmVersion) {
      throw new Error('Unable to locate a pnpm binary and package.json does not declare a packageManager version.');
    }
    console.warn(`corepack not available; falling back to npx pnpm@${pnpmVersion} ${args.join(' ')}`);
    await execa('npx', ['-y', `pnpm@${pnpmVersion}`, ...args], { cwd, stdio, env });
  }
};

async function stageAppPayload() {
  console.log(`🧹 Preparing staging directory at ${stagingPath}`);
  await fsExtra.emptyDir(stagingPath);

  console.log('📄 Preparing package.json and lockfiles for isolated install');
  const packageJsonPath = 'package.json';
  const stagingPackageJsonPath = path.join(stagingPath, 'package.json');
  if (!(await fsExtra.pathExists(packageJsonPath))) {
    throw new Error('package.json not found in project root; cannot continue.');
  }
  const stagedPackageJson = await fsExtra.readJson(packageJsonPath);
  if (stagedPackageJson.scripts?.prepare) {
    console.log('✂️ Removing prepare script from staging package.json to avoid husky install');
    delete stagedPackageJson.scripts.prepare;
  }
  await fsExtra.writeJson(stagingPackageJsonPath, stagedPackageJson, {
    spaces: 2,
  });
  await copyIfExists('pnpm-lock.yaml', path.join(stagingPath, 'pnpm-lock.yaml'), {
    required: true,
  });

  const appNpmrcPath = '.npmrc';
  if (await fsExtra.pathExists(appNpmrcPath)) {
    const baseConfig = await fsExtra.readFile(appNpmrcPath, 'utf-8');
    const sanitizedConfig = baseConfig
      .split(/\r?\n/)
      .filter((line) => line.trim() !== '')
      .filter((line) => !line.startsWith('shamefully-hoist'))
      .filter((line) => !line.startsWith('node-linker'));
    sanitizedConfig.push('node-linker=pnpm');
    await fsExtra.writeFile(path.join(stagingPath, '.npmrc'), `${sanitizedConfig.join('\n')}\n`, 'utf-8');
  }

  console.log('📦 Installing production dependencies in staging via pnpm install');
  await runPnpm(['install', '--prod', '--frozen-lockfile', '--dir', stagingPath], {
    env: {
      HUSKY: '0',
      HUSKY_SKIP_INSTALL: '1',
    },
  });

  await logStagingCopy('Copying compiled output', () =>
    copyIfExists('out', path.join(stagingPath, 'out'), { required: true }),
  );
  await logStagingCopy('Copying assets', () =>
    copyIfExists('assets', path.join(stagingPath, 'assets'), { required: true }),
  );
  await logStagingCopy('Copying release.config.js', () =>
    copyIfExists('release.config.js', path.join(stagingPath, 'release.config.js')),
  );

  // Prune optional dependencies that are not supported on the current build target
  const unsupportedOptionals = external();
  if (unsupportedOptionals.length) {
    console.log(`🗑️ Removing unsupported optional deps from staging: ${unsupportedOptionals.join(', ')}`);
    const pnpmVirtualStore = path.join(stagingPath, 'node_modules', '.pnpm');
    const storeEntries = (await fsExtra.pathExists(pnpmVirtualStore)) ? await fsExtra.readdir(pnpmVirtualStore) : [];
    for (const dep of unsupportedOptionals) {
      const depPath = modulePath(dep);
      if (await fsExtra.pathExists(depPath)) {
        await fsExtra.remove(depPath);
      }
      const sanitized = dep.replace(/\//g, '+');
      for (const entry of storeEntries) {
        if (entry.startsWith(`${sanitized}@`)) {
          await fsExtra.remove(path.join(pnpmVirtualStore, entry));
        }
      }
    }
  }

  for (const pkg of requiredRuntimePackages) {
    const pkgPath = modulePath(pkg);
    if (!(await fsExtra.pathExists(pkgPath))) {
      throw new Error(`Required runtime package '${pkg}' is missing from staging directory at ${pkgPath}`);
    }
  }

  console.log('🔨 Rebuilding native modules against Electron', electronVersion);
  try {
    await runPnpm(
      [
        'exec',
        'electron-rebuild',
        '--version',
        electronVersion,
        '--arch',
        arch,
        '--platform',
        platform,
        '--force',
        '--module-dir',
        stagingPath,
      ],
      {
        cwd: process.cwd(),
        env: {
          HUSKY: '0',
          HUSKY_SKIP_INSTALL: '1',
        },
      },
    );
  } catch (error) {
    console.warn("⚠️  electron-rebuild failed from staging; relying on electron-builder's native rebuild", error);
  }

  console.log('📁 Materializing symlinks in node_modules for packaging');
  const nodeModulesPath = path.join(stagingPath, 'node_modules');
  const materializedPath = `${nodeModulesPath}.materialized`;
  await fsExtra.copy(nodeModulesPath, materializedPath, {
    dereference: true,
    errorOnExist: false,
  });
  await fsExtra.remove(nodeModulesPath);
  await fsExtra.move(materializedPath, nodeModulesPath, { overwrite: true });
  await fsExtra.copy(path.join(process.cwd(), 'node_modules', 'pnpm'), path.join(nodeModulesPath, 'pnpm'), {
    dereference: true,
    errorOnExist: false,
  });

  return stagingPath;
}

const onlyModules = include();

console.log(`🛠️ Building for ${platform} ${arch} ${publish} using ${electronVersion}`);

console.log(`Will only build: ${onlyModules}`);

const stagedAppPath = await stageAppPayload();

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

  default:
    throw new Error(`Unsupported platform: ${platform}`);
}

// Note: electron-builder automatically loads electron-builder.yml if it exists
// The yml config will be merged with the config object below
const config: Configuration = {
  appId: 'app.scriptkit', // Updated appId from package.json
  artifactName: '${productName}-macOS-${version}-${arch}.${ext}',
  productName: 'Script Kit', // Updated productName from package.json
  directories: {
    output: path.resolve('release'),
    buildResources: path.resolve('build'),
  },
  asar: false,
  asarUnpack,
  files: ['**/*'],
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

console.log('Building with config');
console.log('Using directories config', config.directories);
console.log('File include patterns', config.files);
try {
  const uninstallDeps = external();
  console.log(`External optional dependencies (pruned from staging): ${uninstallDeps.join(', ')}`);
  console.log(process.platform, process.arch, process.cwd());

  if (uninstallDeps.length > 0) {
    const pkg = await fsExtra.readJson('package.json');
    console.log(`Optional dependencies before: ${JSON.stringify(pkg.optionalDependencies, null, 2)}`);
  }
  await fsExtra.remove(config.directories.output as string);
  const result = await build({
    config,
    publish,
    targets,
    projectDir: stagedAppPath,
  });
  console.log('Build result', result);
} catch (e: any) {
  console.error('Build failed', e);

  // Check if it's a download error
  const errorMessage = e.toString();
  if (
    errorMessage.includes('status code 403') ||
    errorMessage.includes('cannot resolve') ||
    errorMessage.includes('electron-v')
  ) {
    console.error('\n⚠️  This appears to be a download error (403 Forbidden).');
    console.error('This can happen due to GitHub rate limiting or temporary network issues.');
    console.error('\nSuggestions:');
    console.error('1. Wait a few minutes and try again');
    console.error('2. Use the retry script: pnpm exec tsx scripts/build-with-retry.ts');
    console.error('3. Set ELECTRON_MIRROR environment variable to use a different mirror');
    console.error('4. Check your network connection and proxy settings\n');
  }

  process.exit(1);
} finally {
  if (process.env.KEEP_STAGING === '1') {
    console.log(`🔖 KEEP_STAGING=1 set; leaving staging directory at ${stagingPath}`);
  } else {
    try {
      await fsExtra.remove(stagingPath);
      console.log(`🧹 Cleaned staging directory ${stagingPath}`);
    } catch (cleanupError) {
      console.warn(`⚠️ Failed to clean staging directory: ${cleanupError}`);
    }
  }
}
