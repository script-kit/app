/* eslint-disable */

const version = await arg('Enter the version number');
const tag_name = `v${version}`;

const octokit = github.getOctokit(await env('GITHUB_TOKEN'));

const releaseResponse = await octokit.rest.repos.createRelease({
  ...github.context.repo,
  tag_name,
  name: tag_name,
  prerelease: true,
  draft: true,
});

console.log(releaseResponse);

core.setOutput('result', releaseResponse.data.id);
