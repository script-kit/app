/* eslint-disable */

// import '@johnlindquist/kit';

console.log('Creating assets');

console.log(`🕵️‍♀️ process.env.SCRIPTS_DIR:`, process.env.SCRIPTS_DIR);
console.log(`kenvPkgPath:`, kenvPath(process.env.SCRIPTS_DIR || ''));

let tar = await npm('tar');

let version = await arg('Enter the version number');
let tag_name = `v${version}`;

let { chdir } = await import('process');
// let tar = await npm('tar');

console.log(`PWD`, process.env.PWD);
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

console.log(`⭐️ Starting Kit release for ${tag_name}`);

let octokit = github.getOctokit(await env('GITHUB_TOKEN'));

let releaseResponse = await octokit.rest.repos.createRelease({
  ...github.context.repo,
  tag_name,
  name: tag_name,
  draft: true,
  prerelease: true,
});

let kitFiles = await readdir(kitPath());
let name = 'kit.tar.gz';
let kitTarPath = home(name);
console.log({ kitFiles });

await $`cd ${kitPath()} && npm i`;

let kitModules = await readdir(kitPath('node_modules'));
console.log({ kitModules });

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

await download(
  `https://github.com/johnlindquist/kenv/tarball/${releaseChannel}`,
  path.resolve(process.env.PWD, 'assets'),
  { filename: 'kenv.tar.gz' }
);
