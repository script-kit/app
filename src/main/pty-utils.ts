import os from 'node:os';
import { KIT_FIRST_PATH } from '@johnlindquist/kit/core/utils';
import log from 'electron-log';
import untildify from 'untildify';
import type { TermConfig } from '../shared/types';
import { kitState } from './state';
import { getVersion } from './version';

export const USE_BINARY = os.platform() !== 'win32';

export function getDefaultShell(): string {
  switch (process.platform) {
    case 'win32': {
      // check if cmd.exe exists
      if (process.env.ComSpec) {
        log.info(`Using ComSpec: ${process.env.ComSpec}`);
        return process.env.ComSpec;
      }
      return 'cmd.exe';
    }
    case 'linux': {
      // check if bash exists
      if (process.env.SHELL) {
        log.info(`Using SHELL: ${process.env.SHELL}`);
        return process.env.SHELL;
      }
      return 'bash';
    }
    default: {
      if (process.env.SHELL) {
        log.info(`Using SHELL: ${process.env.SHELL}`);
        return process.env.SHELL;
      }
      return 'zsh';
    }
  }
}

export const defaultConfig: TermConfig = {
  shell: getDefaultShell(),
  promptId: '',
  command: '',
  cwd: untildify(os.homedir()),
  env: process.env as {
    [key: string]: string;
  },
};

export function getDefaultArgs(login: boolean) {
  return process.platform === 'win32' || !login ? [] : ['-l'];
}

export function getShellConfig(config: TermConfig, defaultShell: string) {
  let login = true;
  if (typeof config.shell === 'boolean') {
    if (config.shell) {
      config.shell = config.env.KIT_SHELL || defaultShell;
    } else if (config.command) {
      // eslint-disable-next-line prefer-destructuring
      login = false;
      config.shell = config?.command.split(' ')[0];
      if (config?.args?.length === 0) {
        config.args = config?.command.split(' ').slice(1);
      }
      config.command = '';
    } else {
      config.command = '';
    }
  }

  const args = config?.args?.length ? config.args : getDefaultArgs(login);

  const shell = config.shell || config.env.KIT_SHELL || defaultShell;

  return { shell, args };
}

export function getDefaultOptions() {
  return {
    command: '',
    useConpty: false,
    name: 'xterm-256color',
    cols: 80,
    rows: 24,
    cwd: untildify(os.homedir()),
    encoding: USE_BINARY ? null : 'utf8',
    env: {
      TERM: 'xterm-256color',
      COLORTERM: 'truecolor',
      TERM_PROGRAM: 'Kit',
      TERM_PROGRAM_VERSION: getVersion() || '0.0.0',
      ...process.env,
      ...kitState.kenvEnv,
    },
  };
}

export function getPtyOptions(config: Partial<TermConfig>) {
  const options = getDefaultOptions();
  const env: Record<string, string> = {
    ...process.env,
    ...kitState.kenvEnv,
    ...config?.env,
  };

  // log.info(`env here:`, kitState.kenvEnv);

  env.PATH = config?.env?.PATH || KIT_FIRST_PATH;
  if (kitState.isWindows) {
    env.Path = config?.env?.PATH || KIT_FIRST_PATH;
  }

  options.env = config?.cleanPath ? process.env : env;
  options.cwd = config?.cwd || untildify(os.homedir());
  options.command = config?.command || '';
  options.encoding = USE_BINARY ? null : 'utf8';

  return options;
}
