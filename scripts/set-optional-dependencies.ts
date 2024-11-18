import '@johnlindquist/kit';
import { supportMap } from '../src/main/shims';
import type { Target, OptionalDependency } from '../src/main/shims';

console.log(
  `some of these packages successfully install,
  but then break the distribution,
  so we need to set them conditionally based on platform and architecture`,
);

const pkg = await readJson('package.json');

type Platform = 'linux' | 'mac' | 'win32';
type Arch = 'arm64' | 'x64';

let platform: Platform;
let arch: Arch;


platform = (await arg('platform')) as Platform;
arch = (await arg('arch')) as Arch;


console.log({
  platform,
  arch,
  processPlatform: process.platform,
  processArch: process.arch,
});

console.log({ supportMap });

let platformFinal: 'darwin' | 'win32' | 'linux';
if (platform === 'mac') {
  platformFinal = 'darwin';
} else {
  platformFinal = platform;
}

const target: Target = `${platformFinal}-${arch}`;
const optionalDependenciesToKeep = supportMap[target];
if (!optionalDependenciesToKeep) {
  throw new Error(`No optional dependencies to keep for ${platform} ${arch}`);
}
const optionalDependenciesToRemove = Object.keys(pkg.optionalDependencies).filter(
  (dep) => !optionalDependenciesToKeep.includes(dep as OptionalDependency),
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
