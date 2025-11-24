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
  app: {
    isPackaged: false,
    getPath: () => '/tmp',
    getVersion: () => '1.0.0',
    getName: () => 'ScriptKit',
    on: vi.fn(),
    once: vi.fn(),
    removeListener: vi.fn(),
    removeAllListeners: vi.fn(),
  },
  BrowserWindow: Object.assign(vi.fn().mockImplementation(() => ({
    loadURL: vi.fn(),
    on: vi.fn(),
    once: vi.fn(),
    removeListener: vi.fn(),
    removeAllListeners: vi.fn(),
    close: vi.fn(),
    destroy: vi.fn(),
    show: vi.fn(),
    hide: vi.fn(),
    focus: vi.fn(),
    blur: vi.fn(),
    webContents: {
      on: vi.fn(),
      once: vi.fn(),
      removeListener: vi.fn(),
      removeAllListeners: vi.fn(),
      send: vi.fn(),
      executeJavaScript: vi.fn(),
    },
  })), {
    getAllWindows: vi.fn(() => []),
  }),
  Notification: vi.fn().mockImplementation(() => ({
    show: vi.fn(),
    close: vi.fn(),
    on: vi.fn(),
  })),
  nativeTheme: {
    shouldUseDarkColors: false,
    on: vi.fn(),
    once: vi.fn(),
  },
  powerMonitor: {
    on: vi.fn(),
    once: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    removeAllListeners: vi.fn(),
  },
}));

vi.mock('electron-context-menu', () => ({
  default: vi.fn(),
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
