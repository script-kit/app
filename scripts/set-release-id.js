/* eslint-disable */
import '@johnlindquist/kit';

const result = await arg('CREATE_RELEASE_MAIN_RESULT');

console.log(`createReleaseMainResult: ${result}`);
console.log(`createReleaseNextResult: ${createReleaseNextResult}`);

let releaseId = null;

if (result) {
  console.log(`Found release_id from 'create_release_main': ${result}`);
  releaseId = result;
} else if (createReleaseNextResult) {
  console.log(`Found release_id from 'create_release_next': ${createReleaseNextResult}`);
  releaseId = createReleaseNextResult;
} else {
  console.error('Failed to determine release_id from the workflow step outputs.');
  process.exit(1);
}

core.setOutput('result', releaseId);
console.log(`Release ID set to: ${releaseId}`);
