import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleScript } from './handleScript';
import { runPromptProcess } from './kit';

// Mock dependencies
vi.mock('./kit');
vi.mock('./logs');
vi.mock('./main-script');
vi.mock('./process');
vi.mock('./server/server-utils');
vi.mock('@johnlindquist/kit/core/utils', () => ({
  parseScript: vi.fn().mockResolvedValue({}),
  resolveToScriptPath: vi.fn().mockReturnValue('/test/script.js')
}));

describe('handleScript - Launch Context Detection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should detect MCP context when mcpResponse is true', async () => {
    let capturedHeaders: Record<string, string> = {};
    
    vi.mocked(runPromptProcess).mockImplementation(async (script, args, options) => {
      capturedHeaders = options.headers || {};
      return null;
    });

    await handleScript('test.js', [], '/test', false, '', {}, true);
    
    expect(capturedHeaders['X-Kit-Launch-Context']).toBe('mcp');
  });

  it('should detect MCP context from X-MCP-Tool header', async () => {
    let capturedHeaders: Record<string, string> = {};
    
    vi.mocked(runPromptProcess).mockImplementation(async (script, args, options) => {
      capturedHeaders = options.headers || {};
      return null;
    });

    await handleScript('test.js', [], '/test', false, '', { 'X-MCP-Tool': 'test-tool' }, false);
    
    expect(capturedHeaders['X-Kit-Launch-Context']).toBe('mcp');
  });

  it('should detect socket context from X-Kit-Socket header', async () => {
    let capturedHeaders: Record<string, string> = {};
    
    vi.mocked(runPromptProcess).mockImplementation(async (script, args, options) => {
      capturedHeaders = options.headers || {};
      return null;
    });

    await handleScript('test.js', [], '/test', false, '', { 'X-Kit-Socket': 'true' }, false);
    
    expect(capturedHeaders['X-Kit-Launch-Context']).toBe('socket');
  });

  it('should detect HTTP context from X-Kit-Server header', async () => {
    let capturedHeaders: Record<string, string> = {};
    
    vi.mocked(runPromptProcess).mockImplementation(async (script, args, options) => {
      capturedHeaders = options.headers || {};
      return null;
    });

    await handleScript('test.js', [], '/test', false, '', { 'X-Kit-Server': 'true' }, false);
    
    expect(capturedHeaders['X-Kit-Launch-Context']).toBe('http');
  });

  it('should detect HTTP context from kit-api-key header', async () => {
    let capturedHeaders: Record<string, string> = {};
    
    vi.mocked(runPromptProcess).mockImplementation(async (script, args, options) => {
      capturedHeaders = options.headers || {};
      return null;
    });

    await handleScript('test.js', [], '/test', false, '', { 'kit-api-key': 'test-key' }, false);
    
    expect(capturedHeaders['X-Kit-Launch-Context']).toBe('http');
  });

  it('should default to direct context when no specific headers', async () => {
    let capturedHeaders: Record<string, string> = {};
    
    vi.mocked(runPromptProcess).mockImplementation(async (script, args, options) => {
      capturedHeaders = options.headers || {};
      return null;
    });

    await handleScript('test.js', [], '/test', false, '', {}, false);
    
    expect(capturedHeaders['X-Kit-Launch-Context']).toBe('direct');
  });

  it('should preserve existing headers while adding launch context', async () => {
    let capturedHeaders: Record<string, string> = {};
    
    vi.mocked(runPromptProcess).mockImplementation(async (script, args, options) => {
      capturedHeaders = options.headers || {};
      return null;
    });

    const originalHeaders = { 'Custom-Header': 'value', 'Another': 'header' };
    await handleScript('test.js', [], '/test', false, '', originalHeaders, false);
    
    expect(capturedHeaders).toMatchObject({
      ...originalHeaders,
      'X-Kit-Launch-Context': 'direct'
    });
  });
});