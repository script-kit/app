import { beforeEach, describe, expect, it, vi } from 'vitest';
import { handleScript } from './handleScript';
import { runPromptProcess } from './kit';

// Mock dependencies
vi.mock('./kit', () => ({
  runPromptProcess: vi.fn(),
}));
vi.mock('./logs', () => ({
  mcpLog: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));
vi.mock('./main-script', () => ({
  getMainScriptPath: vi.fn(() => '/main/script.js'),
}));
vi.mock('./process', () => ({
  spawnShebang: vi.fn(),
}));
vi.mock('./server/server-utils', () => ({
  getApiKey: vi.fn(() => 'test-api-key'),
}));
vi.mock('@johnlindquist/kit/core/utils', () => ({
  parseScript: vi.fn().mockResolvedValue({}),
  resolveToScriptPath: vi.fn().mockReturnValue('/test/script.js'),
  kenvPath: vi.fn((subpath?: string) => (subpath ? `/tmp/.kenv/${subpath}` : '/tmp/.kenv')),
  kitPath: vi.fn((subpath?: string) => (subpath ? `/tmp/.kit/${subpath}` : '/tmp/.kit')),
  tmpClipboardDir: '/tmp/clipboard',
  getTrustedKenvsKey: vi.fn(() => 'trusted-kenvs'),
  defaultGroupNameClassName: vi.fn(() => 'default-group'),
  defaultGroupClassName: vi.fn(() => 'default-group-class'),
}));

describe('handleScript - Launch Context Detection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should detect MCP context when mcpResponse is true', async () => {
    let capturedHeaders: Record<string, string> = {};

    vi.mocked(runPromptProcess).mockImplementation(async (_script, _args, options) => {
      capturedHeaders = options.headers || {};
      return null;
    });

    await handleScript('test.js', [], '/test', false, '', {}, true);

    expect(capturedHeaders['X-Kit-Launch-Context']).toBe('mcp');
  });

  it('should detect MCP context from X-MCP-Tool header', async () => {
    let capturedHeaders: Record<string, string> = {};

    vi.mocked(runPromptProcess).mockImplementation(async (_script, _args, options) => {
      capturedHeaders = options.headers || {};
      return null;
    });

    await handleScript('test.js', [], '/test', false, '', { 'X-MCP-Tool': 'test-tool' }, false);

    expect(capturedHeaders['X-Kit-Launch-Context']).toBe('mcp');
  });

  it('should detect socket context from X-Kit-Socket header', async () => {
    let capturedHeaders: Record<string, string> = {};

    vi.mocked(runPromptProcess).mockImplementation(async (_script, _args, options) => {
      capturedHeaders = options.headers || {};
      return null;
    });

    await handleScript('test.js', [], '/test', false, '', { 'X-Kit-Socket': 'true' }, false);

    expect(capturedHeaders['X-Kit-Launch-Context']).toBe('socket');
  });

  it('should detect HTTP context from X-Kit-Server header', async () => {
    let capturedHeaders: Record<string, string> = {};

    vi.mocked(runPromptProcess).mockImplementation(async (_script, _args, options) => {
      capturedHeaders = options.headers || {};
      return null;
    });

    await handleScript('test.js', [], '/test', false, '', { 'X-Kit-Server': 'true' }, false);

    expect(capturedHeaders['X-Kit-Launch-Context']).toBe('http');
  });

  it('should detect HTTP context from kit-api-key header', async () => {
    let capturedHeaders: Record<string, string> = {};

    vi.mocked(runPromptProcess).mockImplementation(async (_script, _args, options) => {
      capturedHeaders = options.headers || {};
      return null;
    });

    await handleScript('test.js', [], '/test', false, '', { 'kit-api-key': 'test-key' }, false);

    expect(capturedHeaders['X-Kit-Launch-Context']).toBe('http');
  });

  it('should default to direct context when no specific headers', async () => {
    let capturedHeaders: Record<string, string> = {};

    vi.mocked(runPromptProcess).mockImplementation(async (_script, _args, options) => {
      capturedHeaders = options.headers || {};
      return null;
    });

    await handleScript('test.js', [], '/test', false, '', {}, false);

    expect(capturedHeaders['X-Kit-Launch-Context']).toBe('direct');
  });

  it('should preserve existing headers while adding launch context', async () => {
    let capturedHeaders: Record<string, string> = {};

    vi.mocked(runPromptProcess).mockImplementation(async (_script, _args, options) => {
      capturedHeaders = options.headers || {};
      return null;
    });

    const originalHeaders = { 'Custom-Header': 'value', Another: 'header' };
    await handleScript('test.js', [], '/test', false, '', originalHeaders, false);

    expect(capturedHeaders).toMatchObject({
      ...originalHeaders,
      'X-Kit-Launch-Context': 'direct',
    });
  });
});
