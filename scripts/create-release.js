/* eslint-disable */

let version = await arg('Enter the version number');
let tag_name = `v${version}`;

let octokit = github.getOctokit(await env('GITHUB_TOKEN'));

let releaseResponse = await octokit.rest.repos.createRelease({
  ...github.context.repo,
  tag_name,
  name: tag_name,
  prerelease: true,
  draft: true,
});

console.log(releaseResponse);

core.setOutput('result', releaseResponse.data.id);
await writeFile('release-id.txt', releaseResponse.data.id);
