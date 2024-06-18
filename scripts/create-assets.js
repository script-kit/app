/* eslint-disable */

// import '@johnlindquist/kit';

import { rm } from 'node:fs/promises';
import { chdir } from 'node:process';
import tar from 'tar';

const createPathResolver =
  (parentDir) =>
  (...parts) => {
    return path.resolve(parentDir, ...parts);
  };

chdir(process.env.PWD);

// Need to consider "esbuild" for each platform and architecture

const version = await arg('Enter the version number');
let platform = await arg('Enter the platform'); // macos-12, windows-latest, ubuntu-latest
const arch = await arg('Enter the architecture');
const release_id = await arg("Enter the release's id");
const tag_name = `v${version}`;

if (platform.startsWith('mac')) {
  platform = 'darwin';
}
if (platform.startsWith('win')) {
  platform = 'win32';
}
if (platform.startsWith('ubuntu')) {
  platform = 'linux';
}

let osName = 'macOS';
if (platform === 'win32') {
  osName = 'Windows';
}
if (platform === 'linux') {
  osName = 'Linux';
}

console.log('PWD', process.env.PWD);

console.log({
  version,
  platform,
  osName,
  arch,
  release_id,
  tag_name,
});

if (await isDir('node_modules')) {
  await rm('node_modules', { recursive: true });
}

const kitPathCopy = createPathResolver(home(`kit-${version}-${platform}-${arch}`));

await ensureDir(kitPathCopy());

// copy kitPath() contents to kitPathCopy
cp('-R', kitPath(), kitPathCopy());

const newKitPath = createPathResolver(kitPathCopy('kit'));

console.log({
  pathCheck: await readdir(newKitPath()),
});

// Clear out arch-specific node_modules
try {
  const command = 'npm un esbuild';
  console.log(`Running ${command} in ${kitPathCopy()}`);

  await exec(command, {
    cwd: newKitPath(),
  });
} catch (e) {
  console.log(e);
  process.exit(1);
}

try {
  const command = `npm i --target_arch=${arch} --target_platform=${platform} --production --prefer-dedupe`;
  console.log(`Running ${command} in ${kitPathCopy()}`);

  await exec(command, {
    cwd: newKitPath(),
    env: {
      npm_config_arch: arch,
      npm_config_platform: platform,
    },
  });
} catch (e) {
  console.log(e);
  process.exit(1);
}

// try {
//   let esbuildCommand = `npm i @esbuild/${platform}-${arch}`;
//   console.log(`Running ${esbuildCommand} in ${newKitPath()}`);
//   await exec(esbuildCommand, {
//     cwd: newKitPath(),
//   });
// } catch (e) {
//   console.log(e);
//   process.exit(1);
// }

const kitModules = await readdir(newKitPath('node_modules'));
console.log({
  kitModules: kitModules.filter((item) => item.includes('esbuild')),
});

console.log(`⭐️ Starting Kit release for ${tag_name}`);

const octokit = github.getOctokit(await env('GITHUB_TOKEN'));

// get release id from tag_name
const releaseResponse = await octokit.rest.repos.getRelease({
  ...github.context.repo,
  release_id,
});

console.log('Release Response:');
console.log(releaseResponse?.data || 'No release found');

const kitFiles = await readdir(newKitPath());
const name = `Kit-SDK-${osName}-${version}-${arch}.tar.gz`;
const kitTarPath = home(name);
console.log({ kitFiles });

await console.log(`Tar ${newKitPath()} to ${kitTarPath}`);

await tar.c(
  {
    cwd: newKitPath(),
    gzip: true,
    file: kitTarPath,
    follow: true,
    filter: (item) => {
      // if (item.match(/^.{0,2}node/)) {
      //   console.log(`SKIPPING`, item);
      //   return false;
      // }
      if (item.includes('kit.sock')) {
        return false;
      }

      return true;
    },
  },
  ['.'],
);

console.log(`Uploading ${name} to releases...`);

const data = await readFile(kitTarPath);

const uploadResponse = await octokit.rest.repos.uploadReleaseAsset({
  ...github.context.repo,
  release_id: releaseResponse.data.id,
  name,
  data,
});

const url = `https://github.com/johnlindquist/kitapp/releases/download/${tag_name}/${name}`;
const fileName = `kit_url_${platform}_${arch}.txt`;

const kitUrlFilePath = path.resolve(process.env.PWD, 'assets', fileName);
const kitTarFilePath = path.resolve(process.env.PWD, 'assets', 'kit.tar.gz');
console.log({ kitUrlFilePath, url });

await writeFile(kitUrlFilePath, url);
// TODO: determine if I want to bundle
// Benefits: Faster install
// Downsides: Larger download, more complicated CI (x64, arm64, etc in different steps)
// await writeFile(kitTarFilePath, data);

// overwrite the release with the new asset
// await copyFile(kitTarPath, outTarz);
