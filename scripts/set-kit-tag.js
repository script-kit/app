/* eslint-disable */
import '@johnlindquist/kit';

console.log('Starting set-kit-tag script');

const { stdout: branchName } = await exec('git rev-parse --abbrev-ref HEAD');
console.log(`Current branch: ${branchName.trim()}`);

let kitTag = 'next';
if (branchName.trim() === 'main') {
  kitTag = 'latest';
}

console.log(`Determined kit_tag: ${kitTag}`);

try {
  console.log('Setting output and exporting variable');
  core.setOutput('kit_tag', kitTag);
  core.exportVariable('kit_tag', kitTag);

  console.log(`kit_tag set to: ${kitTag}`);
  console.log('Current environment variables:');
} catch (error) {
  console.error('Error occurred while setting output or exporting variable:');
  console.error(error);
}

console.log('Finished set-kit-tag script');
