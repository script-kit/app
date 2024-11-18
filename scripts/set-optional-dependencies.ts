import '@johnlindquist/kit';

console.log(
  `some of these packages successfully install,
  but then break the distribution,
  so we need to set them conditionally based on platform and architecture`,
);

const optionalDependencies = await readJson('optional-dependencies.json');
const pkg = await readJson('package.json');


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

console.log({
  platform,
  arch,
  processPlatform: process.platform,
  processArch: process.arch,
});

const optionalDependenciesToKeep = optionalDependencies[platform][arch];
if (!optionalDependenciesToKeep) {
  throw new Error(`No optional dependencies to keep for ${platform} ${arch}`);
}
const optionalDependenciesToRemove = Object.keys(pkg.optionalDependencies).filter(
  (dep) => !optionalDependenciesToKeep.includes(dep),
);

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
