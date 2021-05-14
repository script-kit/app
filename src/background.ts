import { grep } from 'shelljs';
import log from 'electron-log';
import { ChildProcess, fork } from 'child_process';
import {
  KIT,
  KENV,
  execPath,
  NODE_PATH,
  PATH,
  DOTENV,
  KIT_MAC_APP,
} from './helpers';
import { getVersion } from './version';
import { backgroundMessage, MessageData } from './messages';

const backgroundMarker = 'Background: ';

interface Background {
  child: ChildProcess;
  start: string;
}

export const backgroundMap = new Map<string, Background>();

export const removeBackground = (filePath: string) => {
  if (backgroundMap.get(filePath)) {
    const { child } = backgroundMap.get(filePath) as Background;
    backgroundMap.delete(filePath);

    log.info(`> kill background process: ${filePath} ${child?.pid}`);
    child?.kill();
  }
};

export const backgroundScript = (filePath: string, runArgs: string[]) => {
  const child = fork(KIT_MAC_APP, [filePath, ...runArgs], {
    silent: true,
    // stdio: 'inherit',
    execPath,
    env: {
      ...process.env,
      KIT_CONTEXT: 'app',
      KIT_MAIN: filePath,
      PATH,
      KENV,
      KIT,
      NODE_PATH,
      DOTENV,
      KIT_APP_VERSION: getVersion(),
    },
  });

  const pid = child?.pid;
  child?.on('exit', () => {
    if (backgroundMap.get(filePath)?.child?.pid === pid) {
      log.info(`> exit background process: ${filePath} ${pid}`);
      backgroundMap.delete(filePath);
    }
  });

  child?.on('message', backgroundMessage);

  log.info(`> start background process: ${filePath} ${child.pid}`);

  return child;
};

export const updateBackground = (filePath: string, fileChange = false) => {
  const { stdout } = grep(backgroundMarker, filePath);

  const backgroundString = stdout
    .substring(0, stdout.indexOf('\n'))
    .substring(stdout.indexOf(backgroundMarker) + backgroundMarker.length)
    .trim();

  const startTask = () => {
    const child = backgroundScript(filePath, []);
    backgroundMap.set(filePath, {
      start: new Date().toString(),
      child,
    });
  };

  // Task not running. File not changed
  if (
    !backgroundMap.get(filePath) &&
    (backgroundString === 'true' || backgroundString === 'auto') &&
    !fileChange
  ) {
    startTask();
    return;
  }

  // Task running. File changed
  if (backgroundMap.get(filePath) && backgroundString === 'auto') {
    removeBackground(filePath);
    startTask();
  }
};

export const getBackgroundTasks = () => {
  const tasks = Array.from(backgroundMap.entries()).map(
    ([filePath, { child, start }]: [string, Background]) => {
      return {
        filePath,
        process: {
          spawnargs: child?.spawnargs,
          pid: child?.pid,
          start,
        },
      };
    }
  );

  return tasks;
};

export const toggleBackground = (filePath: string) => {
  if (backgroundMap.get(filePath)) {
    removeBackground(filePath);
  } else {
    updateBackground(filePath);
  }
};
