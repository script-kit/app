import fs from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import { splitEnvVarIntoArray } from '@johnlindquist/kit/api/kit';
import { kenvPath } from '@johnlindquist/kit/core/utils';
import { Bonjour } from 'bonjour-service';
import cors from 'cors';
import express from 'express';
import { handleScript } from './handleScript';
import { serverLog as log } from './logs';
import { getServerPort } from './serverTrayUtils';
import { kitState } from './state';

let serverInstance: https.Server | null = null;
let bonjour: Bonjour | null = null;
let app: express.Application | null = null;

// Server start function
export const startServer = () => {
  if (serverInstance) {
    log.warn('Server is already running');
    return;
  }

  log.info('🚀 Starting server initialization...');

  try {
    // Initialize Express app
    log.info('🚀 Creating Express app...');
    app = express();
    log.info('🚀 Express app created successfully');
  } catch (error) {
    log.error('🚀 Error creating Express app:', error);
    throw error;
  }

  // Middleware
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // CORS middleware - using simple cors() to avoid path-to-regexp issues
  app.use(cors());

  // Route handlers - using specific patterns instead of wildcards to avoid path-to-regexp issues

  // Handle root path separately
  app.all('/', async (req, res, next) => {
    const script = '';
    let apiKey = '';

    if (req.method === 'POST') {
      const authHeader = req.headers.authorization || '';
      apiKey = authHeader.startsWith('Bearer ')
        ? authHeader.slice(7)
        : authHeader.includes(' ')
          ? authHeader.split(' ')[1]
          : authHeader;

      const bodyScript = req.body?.script || script;
      const args = req.body?.args || [];
      const cwd = req.body?.cwd || kenvPath();
      const headers = req.headers as Record<string, string>;
      log.info({ script: bodyScript, args, cwd });

      try {
        const result = await handleScript(bodyScript, args, cwd, true, apiKey, headers);
        if (typeof result.data === 'string') {
          res.send(result.data);
        } else if (typeof result.data === 'object') {
          res.json(result.data);
        } else {
          res.send(result?.message || 'No response from script');
        }
      } catch (error) {
        next(error);
      }
    } else {
      const args = (req.query.arg as string[]) || [];
      const cwd = (req.query.cwd as string) || process.cwd();

      log.info('Script:', script, 'Args:', args, 'Cwd:', cwd);

      try {
        const result = await handleScript(script, args, cwd, true, apiKey);
        if (typeof result.data === 'string') {
          res.send(result.data);
        } else {
          res.json(result);
        }
      } catch (error) {
        next(error);
      }
    }
  });

  // Handle single-level paths like /script-name
  app.all('/:script', async (req, res, next) => {
    const scriptPathParts = req.path.split('/').filter(Boolean);
    const script = scriptPathParts.join('/');
    let apiKey = '';

    if (req.method === 'POST') {
      const authHeader = req.headers.authorization || '';
      apiKey = authHeader.startsWith('Bearer ')
        ? authHeader.slice(7)
        : authHeader.includes(' ')
          ? authHeader.split(' ')[1]
          : authHeader;

      const bodyScript = req.body?.script || script;
      const args = req.body?.args || [];
      const cwd = req.body?.cwd || kenvPath();
      const headers = req.headers as Record<string, string>;
      log.info({ script: bodyScript, args, cwd });

      try {
        const result = await handleScript(bodyScript, args, cwd, true, apiKey, headers);
        if (typeof result.data === 'string') {
          res.send(result.data);
        } else if (typeof result.data === 'object') {
          res.json(result.data);
        } else {
          res.send(result?.message || 'No response from script');
        }
      } catch (error) {
        next(error);
      }
    } else {
      const args = (req.query.arg as string[]) || [];
      const cwd = (req.query.cwd as string) || process.cwd();

      log.info('Script:', script, 'Args:', args, 'Cwd:', cwd);

      try {
        const result = await handleScript(script, args, cwd, true, apiKey);
        if (typeof result.data === 'string') {
          res.send(result.data);
        } else {
          res.json(result);
        }
      } catch (error) {
        next(error);
      }
    }
  });

  // Handle two-level paths like /folder/script-name
  app.all('/:folder/:script', async (req, res, next) => {
    const scriptPathParts = req.path.split('/').filter(Boolean);
    const script = scriptPathParts.join('/');
    let apiKey = '';

    if (req.method === 'POST') {
      const authHeader = req.headers.authorization || '';
      apiKey = authHeader.startsWith('Bearer ')
        ? authHeader.slice(7)
        : authHeader.includes(' ')
          ? authHeader.split(' ')[1]
          : authHeader;

      const bodyScript = req.body?.script || script;
      const args = req.body?.args || [];
      const cwd = req.body?.cwd || kenvPath();
      const headers = req.headers as Record<string, string>;
      log.info({ script: bodyScript, args, cwd });

      try {
        const result = await handleScript(bodyScript, args, cwd, true, apiKey, headers);
        if (typeof result.data === 'string') {
          res.send(result.data);
        } else if (typeof result.data === 'object') {
          res.json(result.data);
        } else {
          res.send(result?.message || 'No response from script');
        }
      } catch (error) {
        next(error);
      }
    } else {
      const args = (req.query.arg as string[]) || [];
      const cwd = (req.query.cwd as string) || process.cwd();

      log.info('Script:', script, 'Args:', args, 'Cwd:', cwd);

      try {
        const result = await handleScript(script, args, cwd, true, apiKey);
        if (typeof result.data === 'string') {
          res.send(result.data);
        } else {
          res.json(result);
        }
      } catch (error) {
        next(error);
      }
    }
  });

  // Handle three-level paths like /folder/subfolder/script-name
  app.all('/:folder/:subfolder/:script', async (req, res, next) => {
    const scriptPathParts = req.path.split('/').filter(Boolean);
    const script = scriptPathParts.join('/');
    let apiKey = '';

    if (req.method === 'POST') {
      const authHeader = req.headers.authorization || '';
      apiKey = authHeader.startsWith('Bearer ')
        ? authHeader.slice(7)
        : authHeader.includes(' ')
          ? authHeader.split(' ')[1]
          : authHeader;

      const bodyScript = req.body?.script || script;
      const args = req.body?.args || [];
      const cwd = req.body?.cwd || kenvPath();
      const headers = req.headers as Record<string, string>;
      log.info({ script: bodyScript, args, cwd });

      try {
        const result = await handleScript(bodyScript, args, cwd, true, apiKey, headers);
        if (typeof result.data === 'string') {
          res.send(result.data);
        } else if (typeof result.data === 'object') {
          res.json(result.data);
        } else {
          res.send(result?.message || 'No response from script');
        }
      } catch (error) {
        next(error);
      }
    } else {
      const args = (req.query.arg as string[]) || [];
      const cwd = (req.query.cwd as string) || process.cwd();

      log.info('Script:', script, 'Args:', args, 'Cwd:', cwd);

      try {
        const result = await handleScript(script, args, cwd, true, apiKey);
        if (typeof result.data === 'string') {
          res.send(result.data);
        } else {
          res.json(result);
        }
      } catch (error) {
        next(error);
      }
    }
  });

  // Error handling middleware
  app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
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
      server = http.createServer(app);
    }
  } else {
    server = http.createServer(app);
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
      host: (kitState.kenvEnv.KIT_BONJOUR_HOST as string | undefined) || 'kit.local',
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
