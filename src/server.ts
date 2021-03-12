import Bonjour from 'bonjour';
import micro, { json } from 'micro';
import { tryKitScript } from './kit';

// eslint-disable-next-line import/prefer-default-export
export const startServer = () => {
  const port = 5155;
  const bonjour = Bonjour();

  const server = micro(async (req, res) => {
    const { script, args = [] }: any = await json(req);
    console.log({ script, args });
    tryKitScript(script, args);

    return { script, args };
  });

  server.listen(port);
  bonjour.publish({
    name: 'Kit',
    host: 'kit.local',
    type: 'http',
    port,
  });
};
