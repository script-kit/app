import fs from 'node:fs';
import net from 'node:net';
import { kitPath } from '@johnlindquist/kit/core/utils';
import { handleScript } from './handleScript'; // Import the shared handleScript
import { createLogger } from './log-utils';

const log = createLogger('sk');

/**
 * Starts the socket server.
 */
export const startSK = () => {
  const socketPath = kitPath('kit.sock');

  const startServer = () => {
    const server = net.createServer((stream) => {
      stream.on('data', async (data) => {
        const value = data.toString();
        log.info('Kar value', value);

        const json = value.match(/^{.*}$/gm)?.[0] ?? '{}';
        const { script = '', args = [], cwd, mcpResponse } = JSON.parse(json);

        try {
          const result = await handleScript(script, args, cwd, false, '', { 'X-Kit-Socket': 'true' }, mcpResponse);

          // Check if this is an MCP response request
          if (mcpResponse && result.data) {
            // For MCP, send just the data as JSON
            stream.write(JSON.stringify(result.data));
            stream.end();
          } else {
            // For regular requests, send HTTP-formatted response
            sendResponse(stream, result);
          }
        } catch (error) {
          handleError(stream, error);
        }
      });
    });

    server.listen(socketPath, () => {
      log.info(`Socket server listening on ${socketPath}`);
    });

    server.on('error', (error: NodeJS.ErrnoException) => {
      if (error.code === 'EADDRINUSE') {
        log.warn(`Address ${socketPath} already in use. Attempting to recover...`);
        fs.unlink(socketPath, (unlinkError) => {
          if (unlinkError) {
            log.error(`Failed to delete ${socketPath}:`, unlinkError);
            return;
          }
          log.info(`Deleted ${socketPath}. Retrying to start the server...`);
          startServer();
        });
      } else {
        log.error('Server error:', error);
      }
    });
  };

  // Initial cleanup before starting the server
  if (fs.existsSync(socketPath)) {
    fs.unlinkSync(socketPath);
  }

  startServer();
};

/**
 * Sends a standardized response over the socket.
 * @param stream - The network stream.
 * @param param1 - An object containing status and message.
 */
function sendResponse(stream: any, result: { status?: number; message?: string }) {
  const status = result?.status ?? 500;
  const message = result?.message;
  const statusText = status === 200 ? 'OK' : 'Not Found';
  const response = `HTTP/1.1 ${status} ${statusText}
Content-Type: text/plain${
    message
      ? `
Content-Length: ${message.length}

${message}`
      : ''
  }`.trim();
  stream.write(response);
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
