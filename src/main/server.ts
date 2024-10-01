import express from 'express';
import https from 'node:https';
import fs from 'node:fs';
import { Bonjour } from 'bonjour-service';
import { handleScript } from './handleScript';
import { createLogger } from '../shared/log-utils';
import { getServerPort } from './serverTrayUtils';
import { kitState } from './state';
import { kenvPath } from '@johnlindquist/kit/core/utils';
import { splitEnvVarIntoArray } from '@johnlindquist/kit/api/kit';
import cors from 'cors';

const log = createLogger('server');

let serverInstance: https.Server | null = null;
let bonjour: Bonjour | null = null;
let app: express.Application | null = null;

// Server start function
export const startServer = () => {
  if (serverInstance) {
    log.warn('Server is already running');
    return;
  }

  // Initialize Express app
  app = express();

  // Middleware
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // CORS middleware
  app.use((req, res, next) => {
    const headersOrigin = [req.headers?.origin as string | ''].filter(Boolean);
    const allowedOrigins = splitEnvVarIntoArray(kitState.kenvEnv?.KIT_ALLOWED_ORIGINS, ['*']).concat(headersOrigin);

    cors({
      origin: function (origin, callback) {
        if (!origin) {
          return callback(null, true);
        }

        if (allowedOrigins.includes('*')) {
          return callback(null, true);
        }

        if (allowedOrigins.includes(origin)) {
          return callback(null, true);
        }

        return callback(new Error('Not allowed by CORS'));
      },
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
      credentials: true,
    })(req, res, next);
  });

  // Route handler
  app.all('*', async (req, res, next) => {
    const scriptPathParts = req.path.split('/').filter(Boolean);
    const script = scriptPathParts.join('/');
    let apiKey = '';

    if (req.method === 'POST') {
      const authHeader = (req.headers['authorization'] || '').toString().trim();
      apiKey = authHeader.startsWith('Bearer ')
        ? authHeader.slice(7)
        : authHeader.includes(' ')
          ? authHeader.split(' ')[1]
          : authHeader;

      const bodyScript = req.body?.script || script;
      const args = req.body?.args || [];
      const cwd = req.body?.cwd || kenvPath();
      log.info({ script: bodyScript, args, cwd });

      try {
        const result = await handleScript(bodyScript, args, cwd, true, apiKey, req.headers);
        res.json(result);
      } catch (error) {
        next(error);
      }
    } else {
      const args = (req.query.arg as string[]) || [];
      const cwd = (req.query.cwd as string) || process.cwd();

      log.info('Script:', script, 'Args:', args, 'Cwd:', cwd);

      try {
        const result = await handleScript(script, args, cwd, true, apiKey);
        res.json(result);
      } catch (error) {
        next(error);
      }
    }
  });

  // Error handling middleware
  app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
    const message = `😱 ${err}`;
    log.warn(message);
    res.status(500).json({ status: 500, message });
  });

  const keyPath = kenvPath('key.pem');
  const certPath = kenvPath('cert.pem');
  const useHttps = fs.existsSync(keyPath) && fs.existsSync(certPath);

  let server;

  if (useHttps) {
    try {
      const key = fs.readFileSync(keyPath, 'utf8');
      const cert = fs.readFileSync(certPath, 'utf8');
      const options = { key, cert };

      server = https.createServer(options, app);
      log.info('Configured to use HTTPS');
    } catch (error) {
      log.error('Failed to read SSL certificates:', error);
      log.info('Falling back to HTTP');
      server = app;
    }
  } else {
    server = app;
    log.info('Configured to use HTTP');
  }

  server.listen(getServerPort(), () => {
    serverInstance = server;
    kitState.serverRunning = true;
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

// Server stop function
export const stopServer = () => {
  if (serverInstance) {
    serverInstance.close(() => {
      log.info('Server has been stopped');
      serverInstance = null;
      app = null;
      kitState.serverRunning = false;
      if (bonjour) {
        bonjour.unpublishAll();
        bonjour.destroy();
        bonjour = null;
      }
    });
  } else {
    log.warn('Server is not running');
  }
};

// Server restart function
export const restartServer = () => {
  stopServer();
  startServer();
};
