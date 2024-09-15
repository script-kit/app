import http from 'node:http';
import { URL } from 'node:url';

import { parseScript, resolveToScriptPath } from '@johnlindquist/kit/core/utils';
import { Trigger } from '../shared/enums';
import { runPromptProcess } from './kit';
import { spawnShebang } from './process';
import { createLogger } from '../shared/log-utils';
import { runMainScript } from './main-script';
import { getServerPort } from './serverTrayUtils';
import { kitState } from './state'; // Ensure kitState is imported

const log = createLogger('server');

let serverInstance: http.Server | null = null;

export const startServer = () => {
  if (serverInstance) {
    log.warn('Server is already running');
    return;
  }

  const server = http.createServer(async (req, res) => {
    if (req.method === 'POST') {
      let body = '';
      req.on('data', (chunk) => {
        body += chunk.toString();
      });
      req.on('end', async () => {
        const apiKey = req.headers['authorization']?.split(' ')[1];
        if (!validateApiKey(apiKey)) {
          res.writeHead(401, { 'Content-Type': 'text/plain' });
          res.end('Unauthorized');
          return;
        }

        try {
          const { script, args, cwd } = JSON.parse(body);
          const result = await handleScript(script, args, cwd);
          res.writeHead(result.status, { 'Content-Type': 'text/plain' });
          res.end(result.message);
        } catch (error) {
          handleError(res, error);
        }
      });
    } else {
      const parsedUrl = new URL(req.url || '', `http://${req.headers.host}`);
      const scriptPathParts = parsedUrl.pathname.split('/').filter(Boolean);
      const query = parsedUrl.searchParams;

      const script = scriptPathParts.join('/');
      const args = query.getAll('arg');
      const cwd = query.get('cwd') || process.cwd();

      log.info('Script:', script, 'Args:', args, 'Cwd:', cwd);

      try {
        const result = await handleScript(script, args, cwd);
        res.writeHead(result.status, { 'Content-Type': 'text/plain' });
        res.end(result.message);
      } catch (error) {
        handleError(res, error);
      }
    }
  });

  async function handleScript(script: string, args: string[], cwd: string) {
    if (script === '') {
      await runMainScript();
      return { status: 200, message: 'Main script executed' };
    }

    const scriptPath = resolveToScriptPath(script, cwd);
    if (!scriptPath) {
      return { status: 404, message: '🕹 kit needs a script!' };
    }

    log.info(`🇦🇷 ${scriptPath} ${args}`);
    const { shebang } = await parseScript(scriptPath);

    if (shebang) {
      // Updated spawnShebang parameters to match expected type
      spawnShebang({
        command: shebang, // Assuming 'shebang' contains the command
        args: [], // Add any necessary arguments here
        shell: true, // Enable shell if required
        cwd, // Current working directory
        filePath: scriptPath,
      });
    } else {
      await runPromptProcess(
        scriptPath,
        args.map((s: string) => s.replaceAll('$newline$', '\n')),
        { force: true, trigger: Trigger.Kar, sponsorCheck: false },
      );
    }

    return { status: 200, message: `🚗💨 ~/.kit/kar ${script} ${args.join(' ')}` };
  }

  function handleError(res: http.ServerResponse, error: any) {
    const message = `😱 ${error}`;
    log.warn(message);
    res.writeHead(500, { 'Content-Type': 'text/plain' });
    res.end(message);
  }

  function validateApiKey(key: string | undefined): boolean {
    const validKey = process.env.KIT_API_KEY;
    return key === validKey;
  }

  server.listen(getServerPort(), () => {
    serverInstance = server;
    kitState.serverRunning = true; // {{ added }}
    log.info(`Server listening on port ${getServerPort()}`);
  });
};

// Function to stop the server
export const stopServer = () => {
  if (serverInstance) {
    serverInstance.close(() => {
      log.info('Server has been stopped');
      serverInstance = null;
      kitState.serverRunning = false; // {{ added }}
    });
  } else {
    log.warn('Server is not running');
  }
};

// Function to restart the server
export const restartServer = () => {
  stopServer();
  startServer();
};
