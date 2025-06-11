import { createLogger } from './log-utils';
import { startMcpHttpServer } from './mcp-http-server';
import { getMcpPort } from './serverTrayUtils';

const log = createLogger('mcp-test-bootstrap');

export async function startTestMcpServer(port?: number) {
  if (port) {
    process.env.KIT_MCP_PORT = String(port);
  }
  await startMcpHttpServer();
  const healthUrl = `http://localhost:${port || getMcpPort()}/health`;
  const start = Date.now();
  return new Promise<void>((resolve, reject) => {
    const tick = async () => {
      try {
        const res = await fetch(healthUrl);
        if (res.ok) {
          log.info('Test MCP server ready');
          return resolve();
        }
      } catch {}
      if (Date.now() - start > 10000) {
        return reject(new Error('MCP test server health timeout'));
      }
      setTimeout(tick, 200);
    };
    tick();
  });
}
