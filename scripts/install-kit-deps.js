import os from 'node:os';
import path from 'node:path';
import { execaCommand } from 'execa';

const installDeps = async () => {
  const kitPath = path.resolve(os.homedir(), '.kit');
  const pnpmPath = path.resolve(kitPath, 'pnpm.exe');
  try {
    const results = await execaCommand(`${pnpmPath} install --prod`, { cwd: kitPath });
    console.log(results.stdout);
    console.log(results.stderr);
  } catch (error) {
    console.log(error);
  }
};

installDeps();
