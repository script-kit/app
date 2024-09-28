import { invoke } from '../src/main/invoke-pty';
import { describe, it } from "node:test"
import assert from "node:assert"
import path from "node:path"
import os from "node:os"

// describe('invoke-pty', () => {
//   it('should return the result of the command', async () => {
//     const result = await invoke('which pnpm');
//     console.log({ result });
//     assert(result);
//   });
// });

const kitPath = ()=> path.join(os.homedir(), '.kit');

describe('invoke-pty with cwd', () => {
  it('should return the result of the command', async () => {
    const result = await invoke('pnpm node --version', kitPath());
    console.log({ result });
    assert(result);
  });
});


describe('invoke-pty with quotes in command', () => {
  it('should return the result of the command', async () => {
    const pnpmPath = '/Users/johnlindquist/Library/pnpm/pnpm'
    const result = await invoke(`"${pnpmPath}" node -e "console.log(process.execPath)"`, kitPath());
    console.log({ result });
    assert(result);
  });
});

