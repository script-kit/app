// disable linting for this file
/* eslint-disable */

let tar = await npm('tar');

let version = await arg('Enter the version number');
version = `v${version}`;

console.log(`⭐️ Starting Kit release for ${version}`);

let octokit = github.getOctokit(await env('GITHUB_TOKEN'));

let releaseResponse = await octokit.rest.repos.createRelease({
  ...github.context.repo,
  tag_name: version,
});

let kitFiles = await readdir(kitPath());
let kitTarPath = home('kit.tar.gz');
console.log({ kitFiles });

console.log(`Tar ${kitPath()} to ${kitTarPath}`);

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

let uploadResponse = await octokit.rest.repos.uploadReleaseAsset({
  headers,
  ...github.context.repo,
  release_id: releaseResponse.data.id,
  name: path.basename(url),
  data: await readFile(kitTarPath),
});

console.log(`url: ${uploadResponse.data.browser_download_url}`);

export {};
