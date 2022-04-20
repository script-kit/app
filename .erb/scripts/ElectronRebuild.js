import path from 'path';
import { execSync } from 'child_process';
import fs from 'fs';
import { dependencies } from '../../src/package.json';

const nodeModulesPath = path.join(__dirname, '../../src/node_modules');

if (
  Object.keys(dependencies || {}).length > 0 &&
  fs.existsSync(nodeModulesPath)
) {
  const electronRebuildCmd =
    '../node_modules/.bin/electron-rebuild  --openssl_fips=0 --parallel --types prod,dev,optional --module-dir ../src';
  const cmd =
    process.platform === 'win32'
      ? electronRebuildCmd.replace(/\//g, '\\')
      : electronRebuildCmd;
  execSync(cmd, {
    cwd: path.join(__dirname, '../src'),
    stdio: 'inherit',
  });
}
