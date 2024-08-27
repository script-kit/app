import fs from 'node:fs';
/* eslint-disable @typescript-eslint/naming-convention */
/* eslint-disable import/prefer-default-export */
import net from 'node:net';
import { kitPath, parseScript, resolveToScriptPath } from '@johnlindquist/kit/core/utils';
import { Trigger } from '../shared/enums';
import { runPromptProcess } from './kit';
import { spawnShebang } from './process';
import { createLogger } from '../shared/log-utils';
import { runMainScript } from './main-script';
const log = createLogger('sk');

// TODO: "Force" to front isn't working
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

  async function handleScript(script: string, args: string[], cwd: string) {
    if (script === '') {
      await runMainScript();
      return { status: 200, message: 'Main script executed' };
    }

    const scriptPath = resolveToScriptPath(script, cwd);
    if (!scriptPath) {
      return { status: 404, message: '🕹 sk needs a script!' };
    }

    log.info(`🇦🇷 ${scriptPath} ${args}`);
    const { shebang } = await parseScript(scriptPath);

    if (shebang) {
      spawnShebang({ filePath: scriptPath, shebang });
    } else {
      await runPromptProcess(
        scriptPath,
        args.map((s: string) => s.replaceAll('$newline$', '\n')),
        { force: true, trigger: Trigger.Kar, sponsorCheck: false },
      );
    }

    return { status: 200, message: `🚗💨 ~/.kit/kar ${script} ${args}` };
  }

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
  server.listen(socketPath);
};
