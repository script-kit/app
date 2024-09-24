import http from 'node:http';
import https from 'node:https';
import fs from 'node:fs';
import { URL } from 'node:url';
import { Bonjour, Service } from 'bonjour-service';
import { handleScript } from './handleScript';
import { createLogger } from '../shared/log-utils';
import { getServerPort } from './serverTrayUtils';
import { kitState } from './state';
import { kenvPath } from '@johnlindquist/kit/core/utils';
const log = createLogger('server');

let serverInstance: http.Server | https.Server | null = null;
let bonjour: Bonjour | null = null;
/**
 * Starts the server (HTTP or HTTPS based on available certificates).
 */
export const startServer = () => {
  if (serverInstance) {
    log.warn('Server is already running');
    return;
  }

  const keyPath = kenvPath("key.pem");
  const certPath = kenvPath("cert.pem");
  const useHttps = fs.existsSync(keyPath) && fs.existsSync(certPath);

  let server;

  if (useHttps) {
    try {
      const key = fs.readFileSync(keyPath, 'utf8');
      const cert = fs.readFileSync(certPath, 'utf8');
      const options = { key, cert };

      server = https.createServer(options, requestHandler);
      log.info('Configured to use HTTPS');
    } catch (error) {
      log.error('Failed to read SSL certificates:', error);
      log.info('Falling back to HTTP');
      server = http.createServer(requestHandler);
    }
  } else {
    server = http.createServer(requestHandler);
    log.info('Configured to use HTTP');
  }

  server.listen(getServerPort(), () => {
    serverInstance = server;
    kitState.serverRunning = true; // Track server state
    log.info(`Server listening on port ${getServerPort()}`);

    bonjour = new Bonjour();

    const service = bonjour.publish({
      name: 'Kit Server',
      type: 'http',
      port: getServerPort(),
      host: kitState.kenvEnv.KIT_BONJOUR_HOST || 'kit.local',
    });

    service.on('up', () => {
      log.info(`Bonjour service published: ${service.name} - ${service.type} - ${service.host} - ${service.port}`);
    });

    service.on('error', (error) => {
      log.error(`Bonjour service error: ${error}`);
    });

    service.on('update', () => {
      log.info(`Bonjour service updated: ${service.name} - ${service.type} - ${service.host} - ${service.port}`);
    });

    service.on('remove', () => {
      log.info(`Bonjour service removed: ${service.name} - ${service.type} - ${service.host} - ${service.port}`);
    });

    service.on('stop', () => {
      log.info(`Bonjour service stopped: ${service.name} - ${service.type} - ${service.host} - ${service.port}`);
    });

    log.info(`Bonjour service published: ${service.name} - ${service.type} - ${service.host} - ${service.port}`);
  });
};

/**
 * Handles incoming HTTP/HTTPS requests.
 * @param req - The incoming request.
 * @param res - The response object.
 */
const requestHandler: http.RequestListener = async (req, res) => {
  let apiKey = '';
  if (req.method === 'POST') {
    let body = '';
    for await (const chunk of req) { // Using "for of" loop
      body += chunk.toString();
    }

    const authHeader = (req.headers['authorization'] || '')?.trim();
    apiKey = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader.includes(' ') ? authHeader.split(' ')[1] : authHeader;

    try {

      const parsedBody = JSON.parse(body);
      const script = parsedBody?.script || '';
      const args = parsedBody?.args || [];
      const cwd = parsedBody?.cwd || kenvPath();
      log.info({ script, args, cwd });
      const result = await handleScript(script, args, cwd, true, apiKey);
      sendResponse(res, result);
    } catch (error) {
      handleError(res, error);
    }
  } else {
    const parsedUrl = new URL(req.url || '', `http://${req.headers.host}`);
    const scriptPathParts = parsedUrl.pathname.split('/').filter(Boolean);
    const query = parsedUrl.searchParams;

    const script = scriptPathParts.join('/');
    const args = query.getAll('arg');
    const cwd = query.get('cwd') || process.cwd();

    log.info('Script:', script, 'Args:', args, 'Cwd:', cwd);

    try {
      const result = await handleScript(script, args, cwd, true, apiKey);
      sendResponse(res, result);
    } catch (error) {
      handleError(res, error);
    }
  }
};

/**
 * Sends a standardized response to the client.
 * @param res - The server response object.
 * @param param1 - An object containing status and message.
 */
function sendResponse(
  res: http.ServerResponse,
  { status, message }: { status: number; message: string }
) {
  const statusText = getStatusText(status);
  res.writeHead(status, { 'Content-Type': 'text/plain' });
  res.end(message);
}

/**
 * Handles errors by sending an appropriate response.
 * @param res - The server response object.
 * @param error - The error encountered.
 */
function handleError(res: http.ServerResponse, error: any) {
  const message = `😱 ${error}`;
  log.warn(message);
  sendResponse(res, { status: 500, message });
}

/**
 * Retrieves the standard status text based on the status code.
 * @param status - The HTTP status code.
 * @returns The corresponding status text.
 */
function getStatusText(status: number): string {
  const statusTexts: { [key: number]: string } = {
    200: 'OK',
    201: 'Created',
    400: 'Bad Request',
    401: 'Unauthorized',
    404: 'Not Found',
    500: 'Internal Server Error',
  };
  return statusTexts[status] || 'Unknown Status';
}

/**
 * Stops the server if it's running.
 */
export const stopServer = () => {
  if (serverInstance) {
    serverInstance.close(() => {
      log.info('Server has been stopped');
      serverInstance = null;
      kitState.serverRunning = false; // Update server state
      if(bonjour) {
        bonjour.unpublishAll();
        bonjour.destroy();
        bonjour = null;
      }
    });
  } else {
    log.warn('Server is not running');
  }
};

/**
 * Restarts the server.
 */
export const restartServer = () => {
  stopServer();
  startServer();
};
