/* eslint-disable */

// import '@johnlindquist/kit';

let { chdir } = await import('process');
import { rm } from 'fs/promises';
let tar = await npm('tar');

let createPathResolver = (parentDir) => (...parts) => {
  return path.resolve(parentDir, ...parts);
};

chdir(process.env.PWD);

// Need to consider "esbuild" for each platform and architecture

let version = await arg('Enter the version number');
let platform = await arg('Enter the platform'); // macos-12, windows-latest, ubuntu-latest
let arch = await arg('Enter the architecture');
let release_id = await arg("Enter the release's id");
let tag_name = `v${version}`;

if (platform.startsWith('mac')) platform = 'darwin';
if (platform.startsWith('win')) platform = 'win32';
if (platform.startsWith('ubuntu')) platform = 'linux';

let osName = 'macOS';
if (platform === 'win32') osName = 'Windows';
if (platform === 'linux') osName = 'Linux';

console.log(`PWD`, process.env.PWD);

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

let kitPathCopy = createPathResolver(
  home(`kit-${version}-${platform}-${arch}`)
);

await ensureDir(kitPathCopy());

let command = `npm i --target_arch=${arch} --target_platform=${platform} --production --prefer-dedupe`;
console.log(`Running ${command} in ${kitPathCopy()}`);

// copy kitPath() contents to kitPathCopy
cp('-R', kitPath(), kitPathCopy());

let newKitPath = createPathResolver(kitPathCopy('kit'));

console.log({
  pathCheck: await readdir(newKitPath()),
});

try {
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

try {
  let esbuildCommand = `npm i @esbuild/${platform}-${arch}`;
  console.log(`Running ${esbuildCommand} in ${newKitPath()}`);
  await exec(esbuildCommand, {
    cwd: newKitPath(),
  });
} catch (e) {
  console.log(e);
  process.exit(1);
}

let kitModules = await readdir(newKitPath('node_modules'));
console.log({
  kitModules: kitModules.filter((item) => item.includes('esbuild')),
});

console.log(`⭐️ Starting Kit release for ${tag_name}`);

let octokit = github.getOctokit(await env('GITHUB_TOKEN'));

// get release id from tag_name
let releaseResponse = await octokit.rest.repos.getRelease({
  ...github.context.repo,
  release_id,
});

console.log(`Release Response:`);
console.log(releaseResponse?.data || 'No release found');

let kitFiles = await readdir(newKitPath());
let name = `Kit-SDK-${osName}-${version}-${arch}.tar.gz`;
let kitTarPath = home(name);
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
      if (item.includes('kit.sock')) return false;

      return true;
    },
  },
  ['.']
);

console.log(`Uploading ${name} to releases...`);

let uploadResponse = await octokit.rest.repos.uploadReleaseAsset({
  ...github.context.repo,
  release_id: releaseResponse.data.id,
  name,
  data: await readFile(kitTarPath),
});

let url = `https://github.com/johnlindquist/kitapp/releases/download/${tag_name}/${name}`;
let fileName = `kit_url_${platform}_${arch}.txt`;

let kitUrlFilePath = path.resolve(process.env.PWD, 'assets', fileName);
console.log({ kitUrlFilePath, url });

await writeFile(kitUrlFilePath, url);

// overwrite the release with the new asset
// await copyFile(kitTarPath, outTarz);
