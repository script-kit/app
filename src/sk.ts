/* eslint-disable @typescript-eslint/naming-convention */
/* eslint-disable import/prefer-default-export */
import net from 'net';
import fs from 'fs';
import log from 'electron-log';
import { kitPath } from './helpers';
import { runPromptProcess } from './kit';

export const startSK = () => {
  const server = net.createServer((stream) => {
    stream.on('data', async (data) => {
      const value = data.toString();
      const input = value.match(new RegExp(`(?<=GET /).*(?= HTTP)`))?.[0] || '';

      const [script, ...args] = input.split(' ');
      await runPromptProcess(script, args);
      const message = `🕹 sk ${script} ${args ? args.join(' ') : ''}`;
      log.info(message);
      stream.write(message);
      stream.end();
    });
  });

  const socketPath = kitPath('kit.sock');
  fs.unlinkSync(socketPath);
  server.listen(socketPath);
};
