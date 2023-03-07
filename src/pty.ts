/* eslint-disable no-nested-ternary */
import os from 'os';
import { WebSocket } from 'ws';
import untildify from 'untildify';
import { KIT_FIRST_PATH } from '@johnlindquist/kit/cjs/utils';
import log from 'electron-log';
import { Server } from 'net';
import { ipcMain } from 'electron';
import getPort from './get-port';
import { kitState } from './state';
import { AppChannel } from './enums';

let t: any = null;
let server: Server | null = null;

const USE_BINARY = os.platform() !== 'win32';

export const startPty = async (config: any = {}) => {
  // clear before use
  try {
    if (t) t?.kill();
    if (server) server?.close();
    t = null;
    server = null;
  } catch (error) {
    // ignore
  }

  const { default: express } = await import('express');
  const { default: expressWs } = await import('express-ws');
  const pty = await import('node-pty');

  const command = config?.input || '';
  if (command) log.info(`Terminal command:`, { command });
  const appBase = express();
  const wsInstance = expressWs(appBase);
  const { app } = wsInstance;

  let port: string | number = ``;
  let socketURL = ``;

  log.info(`🐲 >_ Starting pty server with PATH`, KIT_FIRST_PATH);

  let env: any = { PATH: KIT_FIRST_PATH };

  if (kitState.isWindows) {
    env = {
      ...process.env,
      ...config?.env,
    };
    env.PATH = KIT_FIRST_PATH;
    env.Path = KIT_FIRST_PATH;
  }

  const shell =
    config?.env?.KIT_SHELL ||
    (process.platform === 'win32'
      ? 'cmd.exe'
      : // if linux, use bash
      process.platform === 'linux'
      ? 'bash'
      : // if mac, use zsh
        'zsh');

  t = pty.spawn(
    shell,
    [
      // Start in login mode if not windows
      ...(process.platform === 'win32' ? [] : ['-l']),
    ],
    {
      useConpty: false,
      name: 'xterm-256color',
      cols: 80,
      rows: 24,
      cwd: untildify(config?.cwd || os.homedir()),
      encoding: USE_BINARY ? null : 'utf8',
      env,
    }
  );

  const resizeHandler = (
    _event: any,
    {
      cols,
      rows,
    }: {
      cols: number;
      rows: number;
    }
  ) => {
    if (t) t?.resize(cols, rows);
  };

  app.ws('/terminals/:pid', (ws, req) => {
    log.info('Connected to terminal ', t.pid);

    if (command) {
      setTimeout(() => {
        if (USE_BINARY) {
          t.write(`${command}\n`);
        } else {
          // Todo: on Windows this was also submitted the first prompt argument on
          t.write(`${command}\r`);
        }
      }, 250);
    }

    // string message buffering
    function bufferString(socket: WebSocket, timeout: number) {
      let s = '';
      let sender: any = null;
      return (data: any) => {
        s += data;
        if (!sender) {
          sender = setTimeout(() => {
            socket.send(s);
            s = '';
            sender = null;
          }, timeout);
        }
      };
    }
    // binary message buffering
    function bufferUtf8(socket: WebSocket, timeout: number) {
      let buffer: any[] = [];
      let sender: any = null;
      let length = 0;
      return (data: any) => {
        const d = typeof data === 'string' ? Buffer.from(data, 'utf8') : data;

        buffer.push(d);

        length += d.length;
        if (!sender) {
          sender = setTimeout(() => {
            const b = Buffer.concat(buffer, length);

            // const s = b.toString('utf8');a

            // if (s.endsWith('\x07')) {
            //   kitState.terminalOutput = stripAnsi(s);
            // }

            socket.send(b);
            buffer = [];
            sender = null;
            length = 0;
          }, timeout);
        }
      };
    }
    const sendData = USE_BINARY ? bufferUtf8(ws, 5) : bufferString(ws, 5);

    t.onData(async (data: any) => {
      try {
        sendData(data);
      } catch (ex) {
        // The WebSocket is not open, ignore
        log.error(`Error sending data to pty`, ex);
      }
    });

    ipcMain.addListener(AppChannel.TERM_RESIZE, resizeHandler);

    t.onExit(() => {
      try {
        ws.close();
        if (t) t.kill();
        if (server) server.close();
        ipcMain.removeListener(AppChannel.TERM_RESIZE, resizeHandler);
        // t = null;
      } catch (error) {
        log.error(`Error closing pty`, error);
      }
    });
    ws.on('message', (msg: string) => {
      try {
        t.write(msg);
      } catch (error) {
        log.error(`Error writing to pty`, error);
      }
    });
    ws.on('close', () => {
      try {
        if (t) t.kill();
        if (server) server.close();
      } catch (error) {
        log.error(`Error closing pty`, error);
      }
    });
    ws.on('error', (error: any) => {
      log.error(`Error on pty`, error);
    });
  });

  port = process.env.PORT || (await getPort({ port: 3131 }));

  const host = process.platform === 'win32' ? '127.0.0.1' : '0.0.0.0';

  socketURL = `ws://${host}:${port}`;
  log.info(`👂 Listening on ${socketURL}`);
  server = app.listen(port);

  return {
    port,
    socketURL,
    data: ``,
  };
};
