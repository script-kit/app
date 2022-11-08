import dns from 'dns-socket';

export default function internetAvailable(
  options: {
    timeout?: number;
    retries?: number;
    domainName?: string;
    port?: number;
    host?: string;
  } = {}
): Promise<boolean> {
  const defaultSettings = {
    timeout: 1000,
    retries: 10,
    domainName: 'github.com',
    port: 53,
    host: '8.8.8.8',
  };

  const { timeout, retries, domainName, host, port } = {
    ...defaultSettings,
    ...options,
  };

  return new Promise(function (resolve, reject) {
    // Create instance of the DNS resolver
    try {
      const socket = dns({
        timeout,
        retries,
      });

      // Run the dns lowlevel lookup
      socket.query(
        {
          questions: [
            {
              type: 'A',
              name: domainName,
            },
          ],
        },
        port,
        host
      );

      // DNS Address solved, internet available
      socket.on('response', () => {
        socket.destroy(() => {
          resolve(true);
        });
      });

      // Verify for timeout of the request (cannot reach server)
      socket.on('timeout', () => {
        socket.destroy(() => {
          resolve(false);
        });
      });
    } catch (error) {
      resolve(false);
    }
  });
}
