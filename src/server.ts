import Bonjour from 'bonjour';
import log from 'electron-log';
import { Server } from 'http';
import micro, { json } from 'micro';

let server: Server;
let bonjour: Bonjour.Bonjour;

export const serverState = {
  running: false,
  host: '',
  port: 0,
};

export const startServer = (
  host: string,
  port: number,
  callback: (script: string, args: string[]) => void
) => {
  try {
    serverState.host = host;
    serverState.port = port;
    log.info(`Starting: http://${host}:${port}`);

    bonjour = Bonjour();

    server = micro(async (req, res) => {
      const { script, args = [] }: any = await json(req);
      log.info(`Response`, { script, args });
      return callback(script, args);
    });

    server.listen(serverState.port);
    bonjour.publish({
      name: 'Kit',
      host: serverState.host,
      type: 'http',
      port: serverState.port,
    });
  } catch (error) {
    log.warn(error.message);
    log.warn(`Failed to start server on host:${host} port${port}`);
    serverState.host = '';
    serverState.port = 0;
  }
};

export const stopServer = () => {
  log.info(`Stopping: http://${serverState.host}:${serverState.port}`);

  server?.close();
  bonjour.unpublishAll();

  serverState.host = '';
  serverState.port = 0;
};
