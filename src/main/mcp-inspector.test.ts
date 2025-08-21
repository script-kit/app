import { beforeAll, describe, expect, it } from 'vitest';
import { startTestMcpServer } from './mcp-test-bootstrap';

// Mock electron and heavy services to avoid Electron dependency
import { vi } from 'vitest';

// Mock process.resourcesPath before importing any modules that might use it
const originalProcess = process;
vi.stubGlobal('process', {
  ...originalProcess,
  resourcesPath: '/path/to/resources',
});

vi.mock('electron', () => ({
  default: {},
  app: { isPackaged: false, getPath: () => '/tmp', getVersion: () => '1.0.0' },
  nativeTheme: { shouldUseDarkColors: false },
}));

// Provide synthetic script list for registration
const fakeScripts = [
  {
    name: 'echo-test',
    description: 'Echo back argument',
    filePath: '/tmp/echo.js',
    args: [{ name: 'message', placeholder: 'Enter message' }],
  },
];

vi.mock('./mcp-service', () => ({
  mcpService: {
    getMCPScripts: vi.fn(async () => fakeScripts),
    getMCPScript: vi.fn(async (name: string) => fakeScripts.find((s) => s.name === name)),
  },
}));

const port = 5678;
const mcpUrl = `http://localhost:${port}/mcp`;

describe('MCP HTTP lightweight integration', () => {
  beforeAll(async () => {
    await startTestMcpServer(port);
  }, 15000);

  it('lists the fake echo tool', async () => {
    const { stdout } = await import('node:child_process').then(({ execSync }) => ({
      stdout: execSync(`npx --yes @modelcontextprotocol/inspector --cli list-tools ${mcpUrl}`, { encoding: 'utf8' }),
    }));

    const tools = JSON.parse(stdout);
    expect(tools.find((t: any) => t.name === 'echo-test')).toBeDefined();
  });
});
