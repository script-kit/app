/* eslint-disable */
import '@johnlindquist/kit';

const branchName = await $`git rev-parse --abbrev-ref HEAD`;

let kitTag = 'next';
if (branchName.trim() === 'main') {
  kitTag = 'latest';
}

core.setOutput('KIT_TAG', kitTag);

console.log(`Kit tag set to: ${kitTag}`);
