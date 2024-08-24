/* eslint-disable */
import '@johnlindquist/kit';

const branchName = await $`git rev-parse --abbrev-ref HEAD`;

let kitTag = 'next';
if (branchName.trim() === 'main') {
  kitTag = 'latest';
}

core.setOutput('kit_tag', kitTag);

console.log(`Kit tag set to: ${kitTag}`);
