/* eslint-disable */
import '@johnlindquist/kit';

const createReleaseMainResult = await arg('CREATE_RELEASE_MAIN_RESULT');
const createReleaseNextResult = await arg('CREATE_RELEASE_NEXT_RESULT');

console.log(`createReleaseMainResult: ${createReleaseMainResult}`);
console.log(`createReleaseNextResult: ${createReleaseNextResult}`);

let releaseId = null;

if (createReleaseMainResult) {
  console.log(`Found release_id from 'create_release_main': ${createReleaseMainResult}`);
  releaseId = createReleaseMainResult;
} else if (createReleaseNextResult) {
  console.log(`Found release_id from 'create_release_next': ${createReleaseNextResult}`);
  releaseId = createReleaseNextResult;
} else {
  console.error('Failed to determine release_id from the workflow step outputs.');
  process.exit(1);
}

core.setOutput('release_id', releaseId);
console.log(`Release ID set to: ${releaseId}`);
