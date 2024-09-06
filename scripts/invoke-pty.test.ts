import { invoke } from '../src/main/invoke-pty';

async function testInvokePty() {
  try {
    console.log('Testing invoke-pty with "which pnpm" command...');
    const result = await invoke('which pnpm');
    console.log('Result:', result);

    if (result) {
      console.log('Test passed: "which pnpm" returned a result:', result);
    } else {
      console.log('Test failed: "which pnpm" did not return a result.');
    }
  } catch (error) {
    console.error('Test failed with error:', error);
  }
}

testInvokePty();
