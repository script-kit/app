/* eslint-disable */

// import '@johnlindquist/kit';

let { chdir } = await import('process');
let tar = await npm('tar');

console.log('Creating assets');

console.log(`🕵️‍♀️ process.env.SCRIPTS_DIR:`, process.env.SCRIPTS_DIR);
console.log(`kenvPkgPath:`, kenvPath(process.env.SCRIPTS_DIR || ''));

chdir(process.env.PWD);

let { stdout: releaseChannel } = await exec(`git rev-parse --abbrev-ref HEAD`);
console.log({ releaseChannel });

let releaseChannelTxt = path.resolve(
  process.env.PWD,
  'assets',
  'release_channel.txt'
);
console.log({ releaseChannelTxt });

await writeFile(releaseChannelTxt, releaseChannel);

await download(
  `https://github.com/johnlindquist/kenv/tarball/${releaseChannel}`,
  path.resolve(process.env.PWD, 'assets'),
  { filename: 'kenv.tar.gz' }
);

let nodeModulesKit = kitPath();
let outTarz = path.resolve(process.env.PWD, 'assets', 'kit.tar.gz');

console.log(`Tar ${nodeModulesKit} to ${outTarz}`);

await tar.c(
  {
    cwd: nodeModulesKit,
    gzip: true,
    file: outTarz,
    follow: true,
    filter: (item) => {
      if (item.match(/^.{0,2}node/)) {
        console.log(`SKIPPING`, item);
        return false;
      }
      if (item.includes('kit.sock')) return false;

      return true;
    },
  },
  ['.']
);

// Experimental Kit bundle download...

// Need to consider "esbuild" for each platform and architecture

let version = await arg('Enter the version number');
let platform = await arg('Enter the platform');
let arch = await arg('Enter the architecture');
let release_id = await arg("Enter the release's id");
let tag_name = `v${version}`;

if (platform.startsWith('mac')) platform = 'darwin';
if (platform.startsWith('win')) platform = 'win32';
if (platform.startsWith('lin')) platform = 'linux';

console.log(`PWD`, process.env.PWD);

//chdir(kitPath())
//await $`yarn`;

console.log({
  version,
  platform,
  arch,
  release_id,
  tag_name,
});

console.log({
  npm_config_platform: process.env.npm_config_platform,
  npm_config_arch: process.env.npm_config_arch,
  npm_config_target_arch: process.env.npm_config_target_arch,
});

let command = `npm i --target_arch=${arch} --target_platform=${platform} --production`;
console.log(`Running ${command} in ${kitPath()}`);

await exec(command, {
  cwd: kitPath(),
});

let esbuildCommand = `npm i --target_arch=${arch} --target_platform=${platform} --production esbuild`;
console.log(`Running ${esbuildCommand} in ${kitPath()}`);
await exec(esbuildCommand, {
  cwd: kitPath(),
});

// await exec(`npm i`, {
//   cwd: kitPath(),
//   env: {
//     ...process.env,
//     npm_config_platform: platform,
//     npm_config_target_platform: platform,
//     npm_config_arch: arch,
//     npm_config_target_arch: arch,
//   },
// });

let kitModules = await readdir(kitPath('node_modules'));
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

let kitFiles = await readdir(kitPath());
let name = `SDK-${version}-${platform}-${arch}.tar.gz`;
let kitTarPath = home(name);
console.log({ kitFiles });

await console.log(`Tar ${kitPath()} to ${kitTarPath}`);

await tar.c(
  {
    cwd: kitPath(),
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

let kitUrlFilePath = path.resolve(process.env.PWD, 'assets', 'kit_url.txt');
console.log({ kitUrlFilePath, url });

await writeFile(kitUrlFilePath, url);

// overwrite the release with the new asset
// await copyFile(kitTarPath, outTarz);
