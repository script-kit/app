import os from 'os';
import { WebSocket } from 'ws';
import { KIT_FIRST_PATH } from '@johnlindquist/kit/cjs/utils';
import untildify from 'untildify';

import log from 'electron-log';
import { Server } from 'net';
import getPort from './get-port';

let t: any = null;
let server: Server | null = null;

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

  t = pty.spawn(
    config?.env?.KIT_SHELL ||
      (process.platform === 'win32' ? 'cmd.exe' : 'zsh'),
    [],
    {
      name: 'xterm-256color',
      cols: 80,
      rows: 24,
      cwd: untildify(config?.cwd || os.homedir()),
      env: {
        ...process.env,
        ...config?.env,
        PATH: KIT_FIRST_PATH,
      },
      encoding: 'utf8',
    }
  );

  app.ws('/terminals/:pid', function (ws, req) {
    log.info('Connected to terminal ', t.pid);

    if (command) {
      setTimeout(() => {
        t.write(`${command}\n`);
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
    const sendData =
      process.platform !== 'win32' ? bufferUtf8(ws, 5) : bufferString(ws, 5);

    t.onData((data: any) => {
      try {
        sendData(data);
      } catch (ex) {
        // The WebSocket is not open, ignore
      }
    });

    t.onExit(() => {
      ws.close();
      if (t) t.kill();
      if (server) server.close();
      // t = null;
    });
    ws.on('message', function (msg: string) {
      t.write(msg);
    });
    ws.on('close', function () {
      if (t) t.kill();
      if (server) server.close();
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
