import { app } from 'electron';
import path from 'path';
import kill from 'tree-kill';
import { fork, ChildProcess } from 'child_process';
import log from 'electron-log';
import prompt from 'electron-prompt';

export const SIMPLE_PATH = path.join(app.getPath('home'), '.simple');
export const SIMPLE_SCRIPTS_PATH = path.join(SIMPLE_PATH, 'scripts');
export const SIMPLE_BIN_PATH = path.join(SIMPLE_PATH, 'bin');

let child: ChildProcess | null = null;

export const processMap = new Map();
export const shortcutMap = new Map();

interface SimplePromptOptions extends prompt.Options {
  from: 'prompt' | 'log' | 'show' | 'need';
  message: string | undefined;
}

const simpleScript = (execPath: string, execArgv: string[] = []) => {
  log.info('processMap:', processMap);
  log.info(`EXECUTING: ${execPath} ${execArgv.join(' ')}`);
  if (processMap.get(execPath)) {
    kill(processMap.get(execPath));
    processMap.delete(execPath);
    return;
  }

  child = fork('', ['--app'], {
    stdio: 'inherit',
    execPath,
    execArgv,
  });
  processMap.set(execPath, child.pid);

  child.on('exit', () => {
    log.info(`EXITING:`, execPath, '| PID:', child?.pid);
    processMap.delete(execPath);
  });

  child.on('close', () => {
    // log.info(`CLOSING`, child.pid)
    processMap.delete(execPath);
  });

  child.on('disconnect', () => {
    // log.info(`DISCONNECTED`, child.pid)
    processMap.delete(execPath);
  });

  child.on('message', async (data: SimplePromptOptions) => {
    if (data.from === 'prompt') {
      const result = await prompt(data)?.catch((error) => {
        log.error(error);
        child?.kill();
      });
      if (result) {
        child?.send(result);
      } else {
        child?.kill();
      }
    }
    if (data.from === 'need') {
      //  implement need
    }
    if (data.from === 'show') {
      // showDismissableWindow(data);
    }

    if (data.from === 'log') {
      log.info(data.message);
    }
  });

  child.on('error', (error) => {
    child?.send(error);
    processMap.delete(execPath);
    child?.kill();
  });
};

export const trySimpleScript = (execPath: string, execArgv: string[] = []) => {
  try {
    simpleScript(execPath, execArgv);
  } catch (error) {
    log.error(error);
  }
};
