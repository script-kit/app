import '@johnlindquist/kit';

console.log(
  `some of these packages successfully install,
  but then break the distribution,
  so we need to set them conditionally based on platform and architecture`,
);

const optionalDependencies = await readJson('optional-dependencies.json');
const pkg = await readJson('package.json');

type Platform = 'linux' | 'mac' | 'win';
type Arch = 'arm64' | 'x64';

let platform: Platform;
let arch: Arch;

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

  arch = process.arch as Arch;
} else {
  platform = (await arg('platform')) as Platform;
  arch = (await arg('arch')) as Arch;
}

console.log({
  platform,
  arch,
  processPlatform: process.platform,
  processArch: process.arch,
});

console.log({optionalDependencies});

const optionalDependenciesToKeep = optionalDependencies[platform][arch];
if (!optionalDependenciesToKeep) {
  throw new Error(`No optional dependencies to keep for ${platform} ${arch}`);
}
const optionalDependenciesToRemove = Object.keys(pkg.optionalDependencies).filter(
  (dep) => !optionalDependenciesToKeep.includes(dep),
);
if (!optionalDependenciesToRemove.length) {
  console.log('No optional dependencies to remove');
  process.exit(0);
}

const command = `pnpm remove ${optionalDependenciesToRemove.join(' ')}`;

console.log(
  `BEFORE`,
  JSON.stringify({
    pkg: pkg.optionalDependencies,
    optionalDependenciesToKeep,
    optionalDependenciesToRemove,
  }),
);

console.log(`UNINSTALL COMMAND`, command);

if (optionalDependenciesToRemove.length > 0) {
  const { stdout, stderr } = await exec(command);
  console.log({
    stdout,
    stderr,
  });
}
