import fs from 'node:fs';
import net from 'node:net';
import { handleScript } from './handleScript'; // Import the shared handleScript
import { createLogger } from '../shared/log-utils';
import { kitPath } from '@johnlindquist/kit/core/utils';

const log = createLogger('sk');

/**
 * Starts the socket server.
 */
export const startSK = () => {
  const server = net.createServer((stream) => {
    stream.on('data', async (data) => {
      const value = data.toString();
      log.info('Kar value', value);

      const json = value.match(/^{.*}$/gm)?.[0] ?? '{}';
      const { script = '', args = [], cwd } = JSON.parse(json);

      try {
        const result = await handleScript(script, args, cwd);
        sendResponse(stream, result);
      } catch (error) {
        handleError(stream, error);
      }
    });
  });

  server.listen(kitPath('kit.sock'), () => {
    log.info(`Socket server listening on ${kitPath('kit.sock')}`);
  });
};

/**
 * Sends a standardized response over the socket.
 * @param stream - The network stream.
 * @param param1 - An object containing status and message.
 */
function sendResponse(stream: any, { status, message }: { status: number; message: string }) {
  const statusText = status === 200 ? 'OK' : 'Not Found';
  stream.write(
    `HTTP/1.1 ${status} ${statusText}
Content-Type: text/plain
Content-Length: ${message.length}

${message}`,
  );
  stream.end();
}

/**
 * Handles errors by sending an appropriate message over the socket.
 * @param stream - The network stream.
 * @param error - The error encountered.
 */
function handleError(stream: any, error: any) {
  const message = `😱 ${error}`;
  log.warn(message);
  stream.write(message);
  stream.end();
}

const socketPath = kitPath('kit.sock');
if (fs.existsSync(socketPath)) {
  fs.unlinkSync(socketPath);
}
