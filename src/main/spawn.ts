import { createLogger } from './log-utils';
import { createForkOptions } from './fork.options';
import { kitState } from './state';
import { kitPath } from '@johnlindquist/kit/core/utils';
const log = createLogger('spawn.ts');

export const optionalSetupScript = async (
  scriptPath: string,
  argsParam?: string[],
  callback?: (object: any) => void,
) => {
  if (process.env.MAIN_SKIP_SETUP) {
    log.info(`⏭️ Skipping setup script: ${scriptPath}`);
    return Promise.resolve('done');
  }

  const args = argsParam || [];
  return new Promise((resolve, reject) => {
    log.info(`Running optional setup script: ${scriptPath} with ${args}`);
    const child = fork(kitPath('run', 'terminal.js'), [scriptPath, ...args], createForkOptions());

    const id = setTimeout(() => {
      if (child && !child.killed) {
        child.kill();
        resolve('timeout');
        log.info(`⚠️ Setup script timed out: ${scriptPath}`);
      }
    }, 60000);

    if (child?.stdout) {
      child.stdout.on('data', (data) => {
        if (kitState.ready) {
          return;
        }
        log.info(data.toString());
      });
    }

    if (child?.stderr) {
      if (kitState.ready) {
        return;
      }
      child.stderr.on('data', (data) => {
        log.error(data.toString());
      });
    }

    child.on('message', (data) => {
      if (callback) {
        log.info(`📞 ${scriptPath}: callback firing...`);
        callback(data);
      }
    });

    child.on('exit', (code) => {
      if (code === 0) {
        if (id) {
          clearTimeout(id);
        }
        log.info(`✅ Optional setup script completed: ${scriptPath}`);
        resolve('done');
      } else {
        log.info(`⚠️ Optional setup script exited with code ${code}: ${scriptPath}`);
        resolve('error');
      }
    });

    child.on('error', (error: Error) => {
      if (id) {
        clearTimeout(id);
      }
      log.error(`⚠️ Errored on setup script: ${scriptPath}`, error.message);
      resolve('error');
      // reject(error);
      // throw new Error(error.message);
    });
  });
};
