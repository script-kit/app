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
// Create a string  that defines all of the supported architectures in a .yarnrc.yml file

let version = await arg('Enter the version number');
let tag_name = `v${version}`;

console.log(`PWD`, process.env.PWD);

let yarnrc = `
supportedArchitectures:
  os:
    - linux
    - darwin
    - win32

  cpu:
    - x64
    - arm64
`;

// Create a .yarnrc.yml file in the kit directory
await writeFile(kitPath('.yarnrc.yml'), yarnrc);

// await $`cd ${kitPath()} && yarn`;

let kitModules = await readdir(kitPath('node_modules'));
console.log({ kitModules });

console.log(`⭐️ Starting Kit release for ${tag_name}`);

let octokit = github.getOctokit(await env('GITHUB_TOKEN'));

let releaseResponse = await octokit.rest.repos.createRelease({
  ...github.context.repo,
  tag_name,
  name: tag_name,
  prerelease: true,
  draft: true,
});

let kitFiles = await readdir(kitPath());
let name = 'kit.tar.gz';
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

let url = uploadResponse.data.browser_download_url;

let kitUrlFilePath = path.resolve(process.env.PWD, 'assets', 'kit_url.txt');
console.log({ kitUrlFilePath, url });

await writeFile(kitUrlFilePath, url);
// await copyFile(kitTarPath, path.resolve(process.env.PWD, 'assets', name));
