import os from 'os';
import untildify from 'untildify';
import { KIT_FIRST_PATH } from '@johnlindquist/kit/core/utils';
import log from 'electron-log';
import { appDb, kitState } from '../shared/state';
import { TermConfig } from '../shared/types';

export const USE_BINARY = os.platform() !== 'win32';

export function getDefaultShell(): string {
  switch (process.platform) {
    case 'win32':
      // check if cmd.exe exists
      if (process.env.ComSpec) {
        log.info(`Using ComSpec: ${process.env.ComSpec}`);
        return process.env.ComSpec;
      }
      return 'cmd.exe';
    case 'linux':
      // check if bash exists
      if (process.env.SHELL) {
        log.info(`Using SHELL: ${process.env.SHELL}`);
        return process.env.SHELL;
      }
      return 'bash';
    default:
      if (process.env.SHELL) {
        log.info(`Using SHELL: ${process.env.SHELL}`);
        return process.env.SHELL;
      }
      return 'zsh';
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

export function getShellConfig(config: TermConfig, defaultShell: string) {
  let login = true;
  if (typeof config.shell === 'boolean') {
    if (config.shell) {
      config.shell = config.env.KIT_SHELL || defaultShell;
    } else if (config.command) {
      // eslint-disable-next-line prefer-destructuring
      login = false;
      config.shell = config?.command.split(' ')[0];
      if (config?.args?.length === 0)
        config.args = config?.command.split(' ').slice(1);
      config.command = '';
    } else {
      config.command = '';
    }
  }

  const args = config?.args?.length
    ? config.args
    : process.platform === 'win32' || !login
      ? []
      : ['-l'];

  const shell = config.shell || config.env.KIT_SHELL || defaultShell;

  return { shell, args };
}

export function getPtyOptions(config: TermConfig) {
  const env: any = {
    ...process.env,
    ...config?.env,
    ...{
      TERM: 'xterm-256color',
      COLORTERM: 'truecolor',
      TERM_PROGRAM: `Kit`,
      TERM_PROGRAM_VERSION: appDb?.version || '0.0.0',
    },
  };

  env.PATH = config?.env?.PATH || KIT_FIRST_PATH;
  if (kitState.isWindows) {
    env.Path = config?.env?.PATH || KIT_FIRST_PATH;
  }

  return {
    useConpty: false,
    name: 'xterm-256color',
    cols: 80,
    rows: 24,
    cwd: untildify(config?.cwd || os.homedir()),
    encoding: USE_BINARY ? null : 'utf8',
    env: config?.cleanPath ? process.env : env,
  };
}
