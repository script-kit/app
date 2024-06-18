import fs from 'node:fs';
/* eslint-disable @typescript-eslint/naming-convention */
/* eslint-disable import/prefer-default-export */
import net from 'node:net';
import { kitPath, parseScript, resolveToScriptPath } from '@johnlindquist/kit/core/utils';
import log from 'electron-log';
import { Trigger } from '../shared/enums';
import { runPromptProcess } from './kit';
import { spawnShebang } from './process';

// TODO: "Force" to front isn't working
export const startSK = () => {
  const server = net.createServer((stream) => {
    stream.on('data', async (data) => {
      const value = data.toString();
      const json = value.match(/^{.*}$/gm)?.[0] || '';
      const object = JSON.parse(json);

      const { script, args, cwd } = object;

      try {
        const scriptPath = resolveToScriptPath(script, cwd);
        if (scriptPath) {
          log.info(`🇦🇷 ${scriptPath} ${args}`);
          const { shebang } = await parseScript(scriptPath);
          if (shebang) {
            spawnShebang({
              filePath: scriptPath,
              shebang,
            });
          } else {
            await runPromptProcess(
              scriptPath,
              args.map((s: string) => s.replaceAll('$newline$', '\n')),
              {
                force: true,
                trigger: Trigger.Kar,
                sponsorCheck: false,
              },
            );
          }
          const message = `🚗💨 ~/.kit/kar ${script} ${args}`;
          log.info(message);
          // stream.write(message);
          // Replay with proper http message
          stream.write(
            `HTTP/1.1 200 OK
Content-Type: text/plain
Content-Length: ${message.length}

${message}`,
          );
        } else {
          const message = '🕹 sk needs a script!';
          log.info(message);
          // stream.write(message);
          // Replay with not found http message
          stream.write(
            `HTTP/1.1 404 Not Found
Content-Type: text/plain
Content-Length: ${message.length}

${message}`,
          );
        }
        stream.end();
      } catch (error) {
        const message = `😱 ${error}`;
        log.warn(message);
        stream.write(message);
        stream.end();
      }
    });
  });

  const socketPath = kitPath('kit.sock');
  if (fs.existsSync(socketPath)) {
    fs.unlinkSync(socketPath);
  }
  server.listen(socketPath);
};
