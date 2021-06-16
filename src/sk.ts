/* eslint-disable @typescript-eslint/naming-convention */
/* eslint-disable import/prefer-default-export */
import net from 'net';
import fs from 'fs';
import log from 'electron-log';
import { kitPath, resolveScriptPath } from './helpers';
import { runPromptProcess } from './kit';

export const startSK = () => {
  const server = net.createServer((stream) => {
    stream.on('data', async (data) => {
      const value = data.toString();
      log.info(value);
      const json = value.match(new RegExp(`^{.*}$`, 'gm'))?.[0] || '';
      log.info(json);
      const object = JSON.parse(json);
      log.info(object);
      const { script, args } = object;

      const scriptPath = resolveScriptPath(script);
      log.info(`🇦🇷 ${scriptPath} ${args}`);
      if (scriptPath) {
        await runPromptProcess(
          scriptPath,
          args.map((s: string) => s.replaceAll('$newline$', '\n'))
        );
        const message = `🕹 sk ${script} ${args}`;
        log.info(message);
        stream.write(message);
      } else {
        const message = `🕹 sk needs a script!`;
        log.info(message);
        stream.write(message);
      }
      stream.end();
    });
  });

  const socketPath = kitPath('kit.sock');
  fs.unlinkSync(socketPath);
  server.listen(socketPath);
};
