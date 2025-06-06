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
  `PREPARE TO UNINSTALL`,
  JSON.stringify({
    pkg: pkg.optionalDependencies,
    optionalDependenciesToKeep,
    optionalDependenciesToRemove,
  }, null, 2),
);

console.log(`UNINSTALL COMMAND`, command);

if (optionalDependenciesToRemove.length > 0) {
  try {
    console.log(`Starting pnpm remove at ${new Date().toISOString()}`);

    // Log environment info for debugging
    console.log('Environment info:');
    console.log(`- Node version: ${process.version}`);
    console.log(`- Platform: ${process.platform}`);
    console.log(`- Arch: ${process.arch}`);
    console.log(`- CWD: ${process.cwd()}`);
    console.log(`- pnpm version: ${await $`pnpm --version`}`);

    const { stdout, stderr, exitCode } = await exec(command, {
      reject: false, // Don't throw on non-zero exit code
    });

    console.log(`pnpm remove completed at ${new Date().toISOString()}`);
    console.log(`Exit code: ${exitCode}`);
    console.log('=== STDOUT ===');
    console.log(stdout);
    console.log('=== STDERR ===');
    console.log(stderr);
    console.log('=== END OUTPUT ===');

    if (exitCode !== 0) {
      console.error(`pnpm remove failed with exit code ${exitCode}`);

      // Log the current state of node_modules
      console.log('\n=== Current node_modules state ===');
      const nodeModulesContent = await $`ls -la node_modules | head -20`;
      console.log(nodeModulesContent);

      // Check if specific problematic packages exist
      console.log('\n=== Checking for problematic packages ===');
      for (const dep of optionalDependenciesToRemove) {
        const exists = await pathExists(`node_modules/${dep}`);
        console.log(`- ${dep}: ${exists ? 'EXISTS' : 'NOT FOUND'}`);
      }

      // Log package.json state
      console.log('\n=== Current package.json optionalDependencies ===');
      const currentPkg = await readJson('package.json');
      console.log(JSON.stringify(currentPkg.optionalDependencies, null, 2));

      process.exit(exitCode);
    }

    // Verify removal was successful
    console.log('\n=== Verifying removal ===');
    const updatedPkg = await readJson('package.json');
    const remainingOptional = Object.keys(updatedPkg.optionalDependencies || {});
    console.log('Remaining optional dependencies:', remainingOptional);

    // Check if all expected dependencies were removed
    const notRemoved = optionalDependenciesToRemove.filter(dep => remainingOptional.includes(dep));
    if (notRemoved.length > 0) {
      console.error('WARNING: The following dependencies were not removed:', notRemoved);
    }

  } catch (error) {
    console.error('Error during pnpm remove:', error);
    console.error('Error stack:', error.stack);
    process.exit(1);
  }
}
